// AI Content Studio
// Give it one or more topics - for each topic it creates an article, a summary,
// social posts, a header image, a thumbnail and an audio narration,
// then packages everything in a folder with an HTML page and a report.
//
// Run:  node exercise4.js
//   or: node exercise4.js "Healthy sleep" "Learning to code"   (batch mode)

import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import fs from 'fs/promises';
import readline from 'readline/promises';

dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0, // we do our own retries below so we can log them
});

const OUTPUT_DIR = new URL('./output/', import.meta.url);

// How many topics to work on at the same time in batch mode
const BATCH_CONCURRENCY = 2;

// ---------- Settings ----------

// Every step has a list of models: if the first one fails, the next one is tried
const MODELS = {
  text: ['openai/gpt-4o-mini', 'google/gemini-2.5-flash'],
  header: ['dall-e-3', 'gpt-image-1'],         // DALL-E 3 first, gpt-image-1 as fallback
  thumbnail: ['gpt-image-1', 'black-forest-labs/flux.2-klein-4b'],
  speech: ['google/gemini-3.1-flash-tts-preview', 'hexgrad/kokoro-82m'],
  transcribe: 'gpt-4o-mini-transcribe',
};

// Voice control: each tone picks a voice and an emotion for the narration
const TONES = {
  professional: { voice: 'Charon', emotion: 'calm, clear and confident', fallbackVoice: 'onyx' },
  friendly: { voice: 'Kore', emotion: 'warm and friendly, with a smile', fallbackVoice: 'nova' },
  exciting: { voice: 'Puck', emotion: 'excited and energetic', fallbackVoice: 'echo' },
};

// Gemini TTS does not report its cost, so we estimate it from its price list:
// $0.000001 per input token, $0.00002 per output token, about 25 audio tokens per second
const estimateSpeechCost = (text, seconds) => (text.length / 4) * 0.000001 + seconds * 25 * 0.00002;

// ---------- Cost tracking & performance monitoring ----------

const tracker = {
  steps: [],

  record(entry) {
    this.steps.push(entry);
    const cost = entry.cost ? ` $${entry.cost.toFixed(4)}${entry.estimated ? ' (est.)' : ''}` : '';
    const note = entry.status === 'ok' ? 'OK' : 'FAILED';
    console.log(`  [${entry.topic}] ${entry.step}: ${note} - ${entry.model} - ${(entry.ms / 1000).toFixed(1)}s${cost}`);
  },

  totalFor(topic) {
    const steps = this.steps.filter((s) => s.topic === topic);
    return {
      cost: steps.reduce((sum, s) => sum + (s.cost || 0), 0),
      seconds: steps.reduce((sum, s) => sum + s.ms, 0) / 1000,
    };
  },
};

// ---------- Error handling: retry + fallback ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only retry errors that can go away by waiting (rate limit, server problems, network)
const isTemporary = (error) => !error.status || error.status === 429 || error.status >= 500;

const withRetry = async (fn, retries = 2) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isTemporary(error)) throw error;
      const wait = 1000 * 2 ** attempt; // 1s, 2s, 4s ...
      console.log(`    Temporary error (${error.status || error.code}), retrying in ${wait / 1000}s...`);
      await sleep(wait);
    }
  }
};

// Tries each model in order. `run(model)` must return { result, cost, estimated }.
const withFallback = async (topic, step, models, run) => {
  for (const model of models) {
    const start = Date.now();
    try {
      const { result, cost, estimated } = await withRetry(() => run(model));
      tracker.record({ topic, step, model, status: 'ok', ms: Date.now() - start, cost, estimated });
      return { result, model };
    } catch (error) {
      tracker.record({ topic, step, model, status: 'failed', ms: Date.now() - start, error: error.message });
      console.log(`    ${model} failed: ${error.message.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
  }
  throw new Error(`All models failed for step "${step}"`);
};

// ---------- 1. Content creation ----------

const chat = async (model, messages, options = {}) => {
  const response = await openai.chat.completions.create({ model, messages, ...options });
  return { result: response.choices[0].message.content, cost: response.usage?.cost };
};

const generateArticle = (topic, tone) =>
  withFallback(topic, 'article', MODELS.text, (model) =>
    chat(
      model,
      [
        { role: 'system', content: `You are a skilled blog writer. Write in a ${tone} tone.` },
        {
          role: 'user',
          content: `Write a blog article (about 400 words) about "${topic}". Use Markdown: a # title, ## section headings and short paragraphs.`,
        },
      ],
      { temperature: 0.7 }
    )
  );

// Summary, social posts and image prompts in one request, returned as JSON
const generateExtras = (topic, article) =>
  withFallback(topic, 'summary + social posts', MODELS.text, async (model) => {
    const { result, cost } = await chat(
      model,
      [
        {
          role: 'user',
          content: `Here is an article:\n\n${article}\n\nReply only with JSON in this shape:
{
  "summary": "2-3 sentence summary, written to be read aloud",
  "twitter": "tweet under 280 characters with 2 hashtags",
  "linkedin": "professional LinkedIn post, 3-4 sentences",
  "instagram": "fun Instagram caption with emojis and hashtags",
  "headerPrompt": "prompt for a wide, cinematic blog header image with no text",
  "thumbnailPrompt": "prompt for a bold square thumbnail that includes a short 2-4 word title as text"
}`,
        },
      ],
      { temperature: 0.4, response_format: { type: 'json_object' } }
    );
    return { result: JSON.parse(result), cost };
  });

// ---------- 2. Visual design ----------

const generateImage = async (model, prompt, size, quality) => {
  const response = await openai.images.generate({ model, prompt, size, quality });
  return { result: response.data[0].b64_json, cost: response.usage?.cost };
};

// Header: DALL-E 3 (landscape 1792x1024, HD, vivid) - falls back to gpt-image-1 (landscape 1536x1024)
const generateHeader = (topic, prompt) =>
  withFallback(topic, 'header image', MODELS.header, async (model) => {
    if (model === 'dall-e-3') {
      const response = await openai.images.generate({
        model,
        prompt,
        size: '1792x1024',
        quality: 'hd',
        style: 'vivid',
        response_format: 'b64_json',
      });
      return { result: response.data[0].b64_json, cost: response.usage?.cost };
    }
    return generateImage(model, prompt, '1536x1024', 'low');
  });

// Thumbnail: gpt-image-1 is good at putting readable text in images
const generateThumbnail = (topic, prompt) =>
  withFallback(topic, 'thumbnail', MODELS.thumbnail, (model) =>
    model === 'gpt-image-1'
      ? generateImage(model, prompt, '1024x1024', 'low')
      : generateImage(model, prompt, '1024x1024')
  );

// ---------- 3. Audio production ----------

// Gemini returns raw PCM (24000 Hz, 16-bit, mono) - add a WAV header so players can open it
const pcmToWav = (pcm) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);     // PCM
  header.writeUInt16LE(1, 22);     // mono
  header.writeUInt32LE(24000, 24); // sample rate
  header.writeUInt32LE(48000, 28); // bytes per second
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

// Returns { audio, extension } - Gemini gives WAV with emotions, Kokoro (fallback) gives MP3 without
const generateNarration = (topic, script, tone) =>
  withFallback(topic, 'narration', MODELS.speech, async (model) => {
    const { voice, emotion, fallbackVoice } = TONES[tone];

    if (model.startsWith('google/')) {
      // Emotion goes before the colon - Gemini acts it out but does not read it aloud
      const response = await openai.audio.speech.create({
        model,
        voice,
        input: `Say this in a ${emotion} way: ${script}`,
        response_format: 'pcm',
      });
      const pcm = Buffer.from(await response.arrayBuffer());
      const seconds = pcm.length / 48000;
      return {
        result: { audio: pcmToWav(pcm), extension: 'wav', seconds },
        cost: estimateSpeechCost(script, seconds),
        estimated: true,
      };
    }

    const response = await openai.audio.speech.create({
      model,
      voice: fallbackVoice,
      input: script,
      response_format: 'mp3',
    });
    return { result: { audio: Buffer.from(await response.arrayBuffer()), extension: 'mp3' } };
  });

// ---------- 4. Quality control: check the narration with speech-to-text ----------

// Percentage of script words that were actually heard in the audio
const wordMatch = (expected, heard) => {
  const words = (text) => text.toLowerCase().match(/[a-z0-9']+/g) || [];
  const heardWords = new Set(words(heard));
  const expectedWords = words(expected);
  const found = expectedWords.filter((w) => heardWords.has(w)).length;
  return Math.round((found / expectedWords.length) * 100);
};

const checkNarration = async (topic, script, narration) => {
  const start = Date.now();
  try {
    const transcription = await withRetry(async () =>
      openai.audio.transcriptions.create({
        file: await toFile(narration.audio, `narration.${narration.extension}`),
        model: MODELS.transcribe,
      })
    );
    const score = wordMatch(script, transcription.text);
    // Extra words at the start usually mean the voice read the instructions aloud
    const extraWords = transcription.text.split(/\s+/).length - script.split(/\s+/).length;

    tracker.record({ topic, step: 'narration check', model: MODELS.transcribe, status: 'ok', ms: Date.now() - start });
    const passed = score >= 90 && extraWords < 5;
    console.log(`    Narration check: ${score}% of words matched${passed ? '' : ' - WARNING: listen to this file'}`);
    return { score, passed, transcript: transcription.text };
  } catch (error) {
    // A failed check should not stop the whole content suite
    tracker.record({ topic, step: 'narration check', model: MODELS.transcribe, status: 'failed', ms: Date.now() - start, error: error.message });
    return { score: null, passed: false, transcript: null };
  }
};

// ---------- 5. Export system ----------

const slugify = (text) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Very small Markdown -> HTML converter (headings, bold, lists, paragraphs)
const markdownToHtml = (markdown) =>
  markdown
    .split(/\n\s*\n/)
    .map((block) => {
      const html = escapeHtml(block.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      if (html.startsWith('### ')) return `<h4>${html.slice(4)}</h4>`;
      if (html.startsWith('## ')) return `<h3>${html.slice(3)}</h3>`;
      if (html.startsWith('# ')) return `<h2>${html.slice(2)}</h2>`;
      if (/^[-*] /.test(html)) {
        const items = html.split('\n').map((line) => `<li>${line.replace(/^[-*] /, '')}</li>`);
        return `<ul>${items.join('')}</ul>`;
      }
      return `<p>${html.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

const buildPage = (suite) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(suite.topic)} - AI Content Studio</title>
  <style>
    body { font-family: Georgia, serif; max-width: 820px; margin: 0 auto; padding: 24px 16px; color: #222; line-height: 1.6; }
    img { max-width: 100%; border-radius: 10px; }
    .thumb { width: 200px; }
    .card { background: #f4f4f6; border-radius: 10px; padding: 14px 18px; margin: 12px 0; font-family: Arial, sans-serif; }
    .card h4 { margin: 0 0 6px; }
    table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 14px; }
    td, th { border-bottom: 1px solid #ddd; padding: 6px; text-align: left; }
  </style>
</head>
<body>
  ${suite.files.header ? `<img src="${suite.files.header}" alt="Header image">` : ''}
  ${markdownToHtml(suite.article)}

  <h3>Summary</h3>
  <p>${escapeHtml(suite.summary)}</p>
  ${suite.files.narration ? `<audio controls src="${suite.files.narration}"></audio>` : ''}

  <h3>Social posts</h3>
  <div class="card"><h4>Twitter / X</h4>${escapeHtml(suite.social.twitter)}</div>
  <div class="card"><h4>LinkedIn</h4>${escapeHtml(suite.social.linkedin)}</div>
  <div class="card"><h4>Instagram</h4>${escapeHtml(suite.social.instagram)}</div>

  ${suite.files.thumbnail ? `<h3>Thumbnail</h3><img class="thumb" src="${suite.files.thumbnail}" alt="Thumbnail">` : ''}

  <h3>Production report</h3>
  <table>
    <tr><th>Step</th><th>Model</th><th>Status</th><th>Time</th><th>Cost</th></tr>
    ${suite.steps
      .map(
        (s) => `<tr><td>${s.step}</td><td>${s.model}</td><td>${s.status}</td><td>${(s.ms / 1000).toFixed(1)}s</td><td>${
          s.cost ? '$' + s.cost.toFixed(4) + (s.estimated ? ' (est.)' : '') : '-'
        }</td></tr>`
      )
      .join('\n    ')}
  </table>
  <p><strong>Total: $${suite.totals.cost.toFixed(4)} - ${suite.totals.seconds.toFixed(1)}s of API time</strong></p>
</body>
</html>`;

const exportSuite = async (suite, images, narration) => {
  const folder = new URL(`${suite.slug}/`, OUTPUT_DIR);
  await fs.mkdir(folder, { recursive: true });
  const save = (name, data) => fs.writeFile(new URL(name, folder), data);

  suite.files = {};
  if (images.header) {
    suite.files.header = `${suite.slug}-header.png`;
    await save(suite.files.header, Buffer.from(images.header, 'base64'));
  }
  if (images.thumbnail) {
    suite.files.thumbnail = `${suite.slug}-thumbnail.png`;
    await save(suite.files.thumbnail, Buffer.from(images.thumbnail, 'base64'));
  }
  if (narration) {
    suite.files.narration = `${suite.slug}-narration.${narration.extension}`;
    await save(suite.files.narration, narration.audio);
  }

  await save('article.md', suite.article);
  await save('summary.txt', suite.summary);
  await save('social-posts.json', JSON.stringify(suite.social, null, 2));
  await save('index.html', buildPage(suite));

  // manifest.json describes the whole package (everything except the big text/binary data)
  const { article, ...manifest } = suite;
  await save('manifest.json', JSON.stringify(manifest, null, 2));

  console.log(`  [${suite.topic}] Exported to Exercise4/output/${suite.slug}/`);
};

// ---------- One topic, start to finish ----------

const createContentSuite = async (topic, tone) => {
  console.log(`\n>>> Starting "${topic}" (${tone})`);

  // Text first - the images and audio depend on it
  const article = await generateArticle(topic, tone);
  const extras = await generateExtras(topic, article.result);
  const { summary, twitter, linkedin, instagram, headerPrompt, thumbnailPrompt } = extras.result;

  // Images and narration don't depend on each other, so run them at the same time.
  // allSettled: if one fails we still export everything else.
  const [header, thumbnail, narration] = await Promise.allSettled([
    generateHeader(topic, headerPrompt),
    generateThumbnail(topic, thumbnailPrompt),
    generateNarration(topic, summary, tone),
  ]);

  const narrationResult = narration.status === 'fulfilled' ? narration.value.result : null;
  const quality = narrationResult ? await checkNarration(topic, summary, narrationResult) : null;

  const suite = {
    topic,
    slug: slugify(topic),
    tone,
    createdAt: new Date().toISOString(),
    article: article.result,
    summary,
    social: { twitter, linkedin, instagram },
    prompts: { header: headerPrompt, thumbnail: thumbnailPrompt },
    models: {
      article: article.model,
      extras: extras.model,
      header: header.value?.model ?? 'failed',
      thumbnail: thumbnail.value?.model ?? 'failed',
      narration: narration.value?.model ?? 'failed',
    },
    narrationCheck: quality,
    steps: tracker.steps.filter((s) => s.topic === topic),
    totals: tracker.totalFor(topic),
  };

  await exportSuite(
    suite,
    { header: header.value?.result, thumbnail: thumbnail.value?.result },
    narrationResult
  );
  return suite;
};

// ---------- Batch processing ----------

// Works through the list with at most `limit` topics running at the same time
const runBatch = async (topics, tone, limit) => {
  const results = [];
  let next = 0;

  const worker = async () => {
    while (next < topics.length) {
      const topic = topics[next++];
      try {
        results.push({ topic, status: 'ok', suite: await createContentSuite(topic, tone) });
      } catch (error) {
        console.log(`  [${topic}] FAILED: ${error.message}`);
        results.push({ topic, status: 'failed', error: error.message });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, topics.length) }, worker));
  return results;
};

// ---------- Main program ----------

let topics = process.argv.slice(2);
let tone = 'friendly';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
if (topics.length === 0) {
  const answer = await rl.question('Topics (separate with commas for batch mode): ');
  topics = answer.split(',').map((t) => t.trim()).filter(Boolean);
}
const toneAnswer = await rl.question('Tone - professional, friendly or exciting? (default friendly): ');
rl.close();

if (TONES[toneAnswer.trim().toLowerCase()]) tone = toneAnswer.trim().toLowerCase();
if (topics.length === 0) topics = ['The future of electric cars'];

console.log(`\nAI Content Studio - ${topics.length} topic(s), tone: ${tone}`);
const startTime = Date.now();
const results = await runBatch(topics, tone, BATCH_CONCURRENCY);

// Final report for the whole batch
const totalCost = tracker.steps.reduce((sum, s) => sum + (s.cost || 0), 0);
const failedSteps = tracker.steps.filter((s) => s.status === 'failed');

console.log('\n========== Studio Report ==========');
for (const r of results) {
  if (r.status === 'ok') {
    const check = r.suite.narrationCheck?.score != null ? `, narration ${r.suite.narrationCheck.score}% match` : '';
    console.log(`  ${r.topic}: $${r.suite.totals.cost.toFixed(4)}${check}`);
  } else {
    console.log(`  ${r.topic}: FAILED`);
  }
}
console.log(`  Total cost: $${totalCost.toFixed(4)} (speech cost is estimated)`);
console.log(`  Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
console.log(`  Failed attempts (handled by fallback): ${failedSteps.length}`);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(
  new URL('studio-report.json', OUTPUT_DIR),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      tone,
      totalCost,
      totalSeconds: (Date.now() - startTime) / 1000,
      topics: results.map((r) => ({ topic: r.topic, status: r.status, folder: r.suite?.slug, error: r.error })),
      steps: tracker.steps,
    },
    null,
    2
  )
);
console.log('  Saved: Exercise4/output/studio-report.json');
