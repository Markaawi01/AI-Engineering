import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
 
});

const generateText = async (prompt) => {
  const response = await openai.chat.completions.create({
    model: "openai/gpt-5-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    stream:true,
  
    // max_completion_tokens: 150,
  });

for await (const chunk of response) {
  const text = chunk.choices[0]?.delta?.content || "";
  process.stdout.write(text);
}
};

generateText("Waa maxay jaceyl")
