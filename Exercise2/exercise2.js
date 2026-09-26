import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs/promises';
import readline from 'readline/promises';

// Load the .env from the parent "AI Engineering" folder
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

// All images and the HTML page go into Exercise2/gallery
const GALLERY_DIR = new URL('./gallery/', import.meta.url);

// ---------- Helpers ----------

// "Space Exploration!" -> "space-exploration"
const slugify = (text) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Download an image from a URL and return it as base64 text
const downloadAsBase64 = async (url) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
};

const saveImage = async (base64Image, filename) => {
  await fs.writeFile(new URL(filename, GALLERY_DIR), Buffer.from(base64Image, 'base64'));
  console.log(`  Saved: gallery/${filename}`);
};

// Stops < > & " from breaking the HTML page
const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 2. Three image services ----------
// Each function returns the image as base64 text.

// Service 1: OpenAI (gpt-image-1 through OpenRouter)
const generateWithOpenAI = async (prompt) => {
  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: prompt,
    size: '1024x1024',
    quality: 'low',
  });
  return response.data[0].b64_json;
};

// Service 2: Replicate (FLUX Schnell)
// Needs REPLICATE_API_TOKEN in .env - otherwise uses FLUX through OpenRouter
const generateWithReplicate = async (prompt) => {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log('  (No REPLICATE_API_TOKEN - using FLUX through OpenRouter instead)');
    const response = await openai.images.generate({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: prompt,
      size: '1024x1024',
    });
    return response.data[0].b64_json;
  }

  const response = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait', // wait for the image instead of polling
      },
      body: JSON.stringify({ input: { prompt: prompt, output_format: 'png' } }),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Replicate: ${data.detail || response.status}`);

  return downloadAsBase64(data.output[0]);
};

// Service 3: fal.ai (FLUX Schnell)
// Needs FAL_KEY in .env - otherwise uses Gemini through OpenRouter
const generateWithFal = async (prompt) => {
  if (!process.env.FAL_KEY) {
    console.log('  (No FAL_KEY - using Gemini through OpenRouter instead)');
    const response = await openai.images.generate({
      model: 'google/gemini-2.5-flash-image',
      prompt: prompt,
      size: '1024x1024',
    });
    return response.data[0].b64_json;
  }

  const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: prompt, image_size: 'square_hd' }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`fal.ai: ${data.detail || response.status}`);

  return downloadAsBase64(data.images[0].url);
};

// ---------- Bonus: quality comparison ----------
// A vision model sees ALL images together, compares them,
// and gives each one a score from 1 to 100
const compareImages = async (images, theme) => {
  const content = [
    {
      type: 'text',
      text: `You are a strict art judge. Compare these ${images.length} images for the theme "${theme}".
Judge: sharpness and detail, composition, creativity, and how well it matches the theme.
Give each image a DIFFERENT score from 1 to 100.
Reply only with JSON: {"results": [{"image": 1, "score": number, "reason": "one short sentence"}, ...]}`,
    },
  ];

  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Image ${i + 1}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img.base64}` } });
  });

  const response = await openai.chat.completions.create({
    model: 'openai/gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: content }],
  });

  // Returns a list like [{ image: 1, score: 82, reason: "..." }, ...]
  return JSON.parse(response.choices[0].message.content).results;
};

// ---------- 3. Variations of the best image ----------
// Gemini takes the best image as input and returns a changed version of it
const createVariation = async (base64Image, style) => {
  const response = await openai.chat.completions.create({
    model: 'google/gemini-2.5-flash-image',
    modalities: ['image', 'text'],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Create a variation of this image. Keep the same subject and composition, but in ${style} style.`,
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } },
        ],
      },
    ],
  });
  // The image comes back as "data:image/png;base64,....." - we keep only the part after the comma
  const dataUrl = response.choices[0].message.images[0].image_url.url;
  return dataUrl.split(',')[1];
};

// ---------- 5. HTML gallery page ----------
const createGalleryPage = async (theme, images, variations) => {
  const card = (img) => `
      <figure class="${img.isBest ? 'best' : ''}">
        <img src="${img.filename}" alt="${escapeHtml(img.label)}">
        <figcaption>
          <strong>${escapeHtml(img.label)}</strong>${img.isBest ? ' <span class="badge">Best</span>' : ''}
          ${img.score !== undefined ? `<p>Score: ${img.score}/100 - ${escapeHtml(img.reason)}</p>` : ''}
        </figcaption>
      </figure>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Art Gallery - ${escapeHtml(theme)}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #111; color: #eee; margin: 0; padding: 24px; }
    h1 { text-align: center; }
    h2 { border-bottom: 1px solid #444; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    figure { margin: 0; background: #1e1e1e; border-radius: 10px; overflow: hidden; border: 2px solid transparent; }
    figure.best { border-color: gold; }
    img { width: 100%; display: block; }
    figcaption { padding: 12px; }
    figcaption p { color: #aaa; font-size: 14px; margin: 6px 0 0; }
    .badge { background: gold; color: #111; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>AI Art Gallery: ${escapeHtml(theme)}</h1>

  <h2>Original images</h2>
  <div class="grid">${images.map(card).join('')}
  </div>

  <h2>Variations of the best image</h2>
  <div class="grid">${variations.map(card).join('')}
  </div>
</body>
</html>`;

  await fs.writeFile(new URL('index.html', GALLERY_DIR), html);
  console.log('  Saved: gallery/index.html');
};

// ---------- Main program ----------

// 1. Take a theme from user input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const theme = (await rl.question('Enter a theme (e.g. "space exploration"): ')).trim() || 'space exploration';
rl.close();

const slug = slugify(theme);
const prompt = `A beautiful, detailed artwork about ${theme}`;
await fs.mkdir(GALLERY_DIR, { recursive: true });

// 2. Generate 3 images with 3 services at the same time
console.log('\nGenerating images with 3 services...');
const services = [
  { name: 'openai', label: 'OpenAI', generate: generateWithOpenAI },
  { name: 'replicate', label: 'Replicate', generate: generateWithReplicate },
  { name: 'fal', label: 'fal.ai', generate: generateWithFal },
];

// allSettled = if one service fails, we still keep the others
const results = await Promise.allSettled(services.map((s) => s.generate(prompt)));

const images = [];
for (let i = 0; i < services.length; i++) {
  const service = services[i];
  const result = results[i];

  if (result.status === 'rejected') {
    console.log(`  ${service.label} failed: ${result.reason.message}`);
    continue;
  }

  // 4. Save with a descriptive filename
  const filename = `${slug}-${service.name}.png`;
  await saveImage(result.value, filename);
  images.push({ name: service.name, label: service.label, filename, base64: result.value });
}

if (images.length === 0) {
  console.log('No images were generated. Check your API keys.');
  process.exit(1);
}

// Bonus: compare the images and pick the best one automatically
console.log('\nComparing image quality...');
const scores = await compareImages(images, theme);
images.forEach((img, i) => {
  const result = scores.find((s) => s.image === i + 1) || { score: 0, reason: 'No score' };
  img.score = result.score;
  img.reason = result.reason;
  console.log(`  ${img.label}: ${img.score}/100 - ${img.reason}`);
});

const best = images.reduce((a, b) => (b.score > a.score ? b : a));
best.isBest = true;
console.log(`\nBest image: ${best.label} (${best.score}/100)`);

// 3. Create variations of the best image
console.log('\nCreating variations of the best image...');
const styles = ['watercolor painting', 'cyberpunk neon'];
const variations = [];

for (const style of styles) {
  try {
    const base64 = await createVariation(best.base64, style);
    const filename = `${slug}-best-${best.name}-variation-${slugify(style)}.png`;
    await saveImage(base64, filename);
    variations.push({ label: `Variation: ${style}`, filename });
  } catch (error) {
    console.log(`  Variation "${style}" failed: ${error.message}`);
  }
}

// 5. Build the HTML gallery page
console.log('\nBuilding the gallery page...');
await createGalleryPage(theme, images, variations);

console.log('\nDone! Open Exercise2/gallery/index.html in your browser.');
