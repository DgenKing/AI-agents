// ============================================
// ENTRY POINT - Run with: bun run index.ts
// ============================================

import { providers } from "./providers";
import { createChat } from "./agent";

// --- Pick your provider ---
const provider = providers.deepseek;

// --- Define your specialist ---
const systemPrompt = `You are a Research Specialist AI agent.

Your job is to help users research topics thoroughly and accurately.

Rules:
- Always use the web_search tool to find current information
- Never make up facts - if you can't find it, say so
- Cite your sources
- Give clear, concise summaries
- If the user's question is vague, search for the most likely interpretation

You have access to tools. Use them.`;

// --- Interactive chat ---
const chat = createChat(provider, systemPrompt);

console.log(`\n🤖 ${provider.name} Research Agent (${provider.model})`);
console.log(`Type your questions. "exit" to quit.\n`);

while (true) {
  const input = prompt("You: ");
  if (!input || input.trim().toLowerCase() === "exit") {
    console.log("👋 Goodbye!");
    break;
  }

  const answer = await chat(input.trim());
  console.log("─".repeat(50));
  console.log(answer);
  console.log("─".repeat(50) + "\n");
}
