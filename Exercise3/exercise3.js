import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs/promises';

// Load the .env from the parent "AI Engineering" folder
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

// Gemini TTS understands emotions written in the text, like "Say sadly: ..."
// (the OpenAI "instructions" option is ignored by the models on OpenRouter)
const MODEL = 'google/gemini-3.8-flash-tts';

// All audio files go into Exercise3/audio
const AUDIO_DIR = new URL('./audio/', import.meta.url);

// ---------- The speakers ----------
// Each speaker has their own voice and their own instructions (personality)
const speakers = {
  amina: {
    voice: 'Kore',
    instructions: 'a confident young team leader who speaks clearly',
  },
  omar: {
    voice: 'Puck',
    instructions: 'a nervous junior developer who talks a bit fast',
  },
  hassan: {
    voice: 'Charon',
    instructions: 'a calm, wise senior engineer with a deep, slow voice',
  },
};

// ---------- The conversation ----------
// Every line has a speaker, an emotion and the text to say
const conversation = [
  { speaker: 'amina', emotion: 'excited', text: 'Team, the client just called. They want the new app live by Friday!' },
  { speaker: 'omar', emotion: 'worried and stressed', text: 'Friday? But half of the features are still broken. We will never make it.' },
  { speaker: 'hassan', emotion: 'calm and reassuring', text: 'Relax, Omar. We have done harder things before. One step at a time.' },
  { speaker: 'omar', emotion: 'sad and disappointed in himself', text: 'I just feel like the bugs are my fault. I pushed code without testing it.' },
  { speaker: 'amina', emotion: 'warm and encouraging', text: 'Everyone makes mistakes. What matters is that we fix them together.' },
  { speaker: 'hassan', emotion: 'cheerful and proud', text: 'Exactly. Now, who wants coffee? It is going to be a long night.' },
];

// ---------- Helpers ----------

// Gemini returns raw "PCM" sound (24000 samples per second, 16-bit, mono).
// Music players can't open raw PCM, so we add a 44-byte WAV header in front.
const pcmToWav = (pcm) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4); // file size - 8
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);    // size of the format section
  header.writeUInt16LE(1, 20);     // 1 = PCM
  header.writeUInt16LE(1, 22);     // 1 channel (mono)
  header.writeUInt32LE(24000, 24); // sample rate
  header.writeUInt32LE(48000, 28); // bytes per second (24000 * 2)
  header.writeUInt16LE(2, 32);     // bytes per sample
  header.writeUInt16LE(16, 34);    // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

// Half a second of silence to put between the lines
const silence = Buffer.alloc(24000); // 12000 samples * 2 bytes = 0.5s

// Generate speech for one line with the speaker's voice, instructions and emotion
const speak = async (line) => {
  const speaker = speakers[line.speaker];

  // The direction goes before the colon - Gemini acts it out but does not read it aloud
  const input = `You are ${speaker.instructions}. Say this in a ${line.emotion} way: ${line.text}`;

  const response = await openai.audio.speech.create({
    model: MODEL,
    voice: speaker.voice,
    input: input,
    response_format: 'pcm',
  });

  return Buffer.from(await response.arrayBuffer());
};

// "worried and stressed" -> "worried-and-stressed"
const slugify = (text) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Main program ----------
await fs.mkdir(AUDIO_DIR, { recursive: true });

console.log('Generating the conversation...\n');
const allClips = [];

for (let i = 0; i < conversation.length; i++) {
  const line = conversation[i];
  const pcm = await speak(line);

  // Save every line as its own audio file, e.g. "01-amina-excited.wav"
  const number = String(i + 1).padStart(2, '0');
  const filename = `${number}-${line.speaker}-${slugify(line.emotion)}.wav`;
  await fs.writeFile(new URL(filename, AUDIO_DIR), pcmToWav(pcm));

  console.log(`${line.speaker} (${line.emotion}): "${line.text}"`);
  console.log(`  Saved: audio/${filename}\n`);

  allClips.push(pcm, silence);
}

// Extra: join every line into one file to hear the whole conversation
await fs.writeFile(new URL('full-conversation.wav', AUDIO_DIR), pcmToWav(Buffer.concat(allClips)));
console.log('Saved: audio/full-conversation.wav');

console.log('\nDone! Open the Exercise3/audio folder to listen.');
