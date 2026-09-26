import dotenv from 'dotenv';
import OpenAI from 'openai';
import readline from 'readline/promises';

// Load the .env from the parent "AI Engineering" folder,
// so it works no matter which folder you run the file from
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

// gpt-4o-mini supports temperature (gpt-5-mini ignores it)
const MODEL = "openai/gpt-4o-mini";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Sends messages to the AI, prints the answer while it streams,
// and returns the full text so we can use it later
const streamChat = async (messages, temperature) => {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: messages,
    temperature: temperature,
    stream: true,
  });

  let fullText = "";

  for await (const chunk of response) {
    const text = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(text);
    fullText += text;
  }

  console.log("\n");
  return fullText;
};

// 1. Take user input for a topic
const topic = await rl.question("Enter a blog topic: ");

// Bonus: temperature control
const mode = await rl.question("Choose mode - (1) Factual or (2) Creative: ");
const temperature = mode.trim() === "2" ? 1.0 : 0.2;
console.log(`Using temperature ${temperature}\n`);

// 2 + 3. Generate a blog post outline with streaming
console.log("===== Blog Post Outline =====\n");
const outline = await streamChat(
  [
    { role: "system", content: "You are a helpful blog writing assistant." },
    { role: "user", content: `Create a blog post outline about: ${topic}` },
  ],
  temperature
);

// 4. Summarize the outline in 2 sentences
console.log("===== Summary =====\n");
await streamChat(
  [
    {
      role: "user",
      content: `Summarize this blog post outline in exactly 2 sentences:\n\n${outline}`,
    },
  ],
  0.2
);

// 5. Answer follow-up questions about the topic
// We keep the conversation history so the AI remembers the outline
const history = [
  {
    role: "system",
    content: `You are an expert on "${topic}". Answer follow-up questions about this topic clearly and briefly.`,
  },
  { role: "assistant", content: outline },
];

console.log('Ask follow-up questions (type "exit" to quit)\n');

while (true) {
  const question = await rl.question("You: ");

  if (question.trim().toLowerCase() === "exit") break;
  if (!question.trim()) continue;

  history.push({ role: "user", content: question });

  process.stdout.write("AI: ");
  const answer = await streamChat(history, temperature);

  history.push({ role: "assistant", content: answer });
}

console.log("Goodbye!");
rl.close();
