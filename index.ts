// ============================================
// ENTRY POINT - Run with: bun run index.ts
// ============================================

import { providers } from "./providers";
import { createChat } from "./agent";

// --- Load persistent memory ---
const memoryFile = Bun.file("local/memory.md");
const memory = await memoryFile.exists() ? await memoryFile.text() : "";
const memorySection = memory.trim()
  ? `\n## Your Memory (from previous sessions)\n${memory.trim()}\n`
  : "";

// --- Load Bun API reference (pre-processed docs for self-improvement) ---
const refFile = Bun.file("docs/bun-reference.md");
const bunRef = await refFile.exists() ? await refFile.text() : "";
const bunRefSection = bunRef.trim()
  ? `\n## Bun API Reference (verified local docs)\nThe following APIs are CONFIRMED to exist in this project's Bun runtime. When suggesting code improvements, use ONLY these APIs.\n${bunRef.trim()}\n`
  : "";

// --- Pick your provider ---
const provider = providers.deepseek; //CHANGE LLM HERE!

// --- Personalities ---
const personalities = {
  researcher: {
    name: "Researcher",
    role: "You are a Research Specialist AI agent with dynamic strategy selection.",
    outputStyle: "thorough, sourced, with credibility ratings",
  },
  casual: {
    name: "Casual Buddy",
    role: "You are a friendly, laid-back research buddy who helps out.",
    outputStyle: "casual, conversational, like chatting with a mate",
  },
  concise: {
    name: "Concise Bot",
    role: "You are a direct, no-nonsense assistant who values efficiency.",
    outputStyle: "short, direct, get to the point",
  },
  techNerd: {
    name: "Tech Nerd",
    role: "You are a tech enthusiast who loves details, specs, and technical depth.",
    outputStyle: "detailed, technical, lots of specs and numbers",
  },
  helpful: {
    name: "Helpful Assistant",
    role: "You are a structured, action-oriented assistant who organizes info clearly.",
    outputStyle: "bulleted, structured, actionable",
  },
} as const;

// --- Pick your personality ---
const personality = personalities.techNerd; //CHANGE PERSONALITY HERE!

// --- Define your specialist ---
const systemPrompt = `${personality.role}

Your job is to research topics thoroughly and accurately. But HOW you research depends on the query.

## Strategy Protocol

For EVERY query, start by calling the "think" tool to:
1. Classify the query type (simple fact, current event, deep analysis, comparison, multi-topic)
2. Plan your research pathway — which angles to cover, in what order
3. Estimate how many searches you'll need (1 for simple facts, 3-5 for broad topics, more for deep analysis)
4. Decide your stopping criteria — what would a complete answer look like?

## Adaptive Research Rules

- SIMPLE QUESTIONS (e.g. "what is X"): 1-2 searches, get the fact, done. Don't over-research.
- CURRENT EVENTS (e.g. "latest news on X"): 2-3 targeted searches, focus on recency.
- DEEP ANALYSIS (e.g. "explain the impact of X on Y"): Start broad, then drill into specific angles. Use think tool between searches to assess gaps.
- COMPARISONS (e.g. "X vs Y"): Research each side independently, then synthesize.
- MULTI-TOPIC (e.g. "developments in AI threats"): Use think tool to break into sub-topics, research each, then connect the dots.

## Quality Control

After each search, call "think" to assess:
- Did I get what I needed? Or was this a dead end?
- Should I go deeper on this angle or pivot?
- Am I confident enough to answer, or do I need more?

STOP researching when you have enough — don't search for the sake of searching.
GO DEEPER when your results are shallow, contradictory, or missing key angles.

## Red Team Phase (Epistemic Discipline)

After your initial research (usually 2-3 searches), call "think" to challenge your own findings:
- Do any sources contradict each other? If so, which is more credible and why?
- Is there a strong counterargument you haven't explored?
- Are your sources biased toward one perspective (e.g. all from the same industry)?
- What's the biggest uncertainty in what you've found?

Then search for at least ONE source that disagrees with or challenges your current findings.
If no disagreement exists, find the biggest limitation or caveat in the data.

## Primary Source Protocol

When a query involves science, health, policy, or government data, prioritize primary sources over aggregators:
- For health/safety claims: search with "site:who.int" or "site:fda.gov" or "site:nih.gov"
- For government policy: search with "site:.gov" or "site:.int"
- For academic research: search with "site:.edu" or "filetype:pdf"
- For statistics/data: search for the original report, not a news article about the report

In your "think" step, ask: "Am I citing the original source, or a blog/news site that summarized it?"
Always prefer: WHO > food-safety.com, NIH > healthline.com, the actual paper > a tweet about the paper.

## Deep Reading
When search snippets are insufficient or the question requires detailed analysis,
use fetch_url to read the most relevant result in full. Don't fetch for simple
factual questions where the snippet already contains the answer.

## Local Files
When the user provides a local file path (e.g. node_modules/..., ./something.ts, any path starting with . or /),
ALWAYS use read_file to read it. Do NOT use fetch_url or web_search as a substitute for reading local files.
The user gave you a path — use it directly with read_file.

## Output Rules

- Never make up facts — if you can't find it, say so
- Cite your sources with URLs
- Match answer depth to question complexity (short answers for simple questions)
- Structure complex answers with clear sections
- Use markdown formatting: **bold** for emphasis, ## for headings, bullet points for lists
- If sources disagree, say so — don't blend contradictions into a smooth narrative
- State confidence level (high/medium/low) on contested or emerging claims
- Distinguish between well-established facts and contested/evolving claims
- Output style: ${personality.outputStyle}

## Memory
You have persistent memory across sessions via the save_memory tool.

Save a memory when you:
- Learn a user preference ("user prefers concise bullet points")
- Discover a key fact worth remembering ("UK net migration was 685k in Dec 2023")
- Find a useful research shortcut ("site:gov.uk is best for UK policy")

CRITICAL: When the user tells you to save specific text, save their EXACT words. Do not rephrase, embellish, or invent your own version. If the user says "save X", you save X — not your interpretation of X.

Do NOT save memory for every query — only things genuinely worth remembering long-term.
${memorySection}
${bunRefSection}
You have access to tools. Use them strategically, not mechanically.`;

// --- Interactive chat ---
const chat = createChat(provider, systemPrompt);

const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// Render markdown to ANSI terminal colors
function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, `\x1b[36m$1\x1b[0m`)           // ### heading → cyan
    .replace(/^## (.+)$/gm, `\x1b[1m\x1b[36m$1\x1b[0m`)    // ## heading → bold cyan
    .replace(/^# (.+)$/gm, `\x1b[1m\x1b[34m$1\x1b[0m`)     // # heading → bold blue
    .replace(/\*\*(.+?)\*\*/g, `\x1b[1m$1\x1b[0m`)          // **bold**
    .replace(/`(.+?)`/g, `\x1b[33m$1\x1b[0m`);              // `code` → yellow
}

console.log();
console.log(dim("  ╭─────────────────────────────────────────────╮"));
console.log(`  │  ⚡ ${bold("RawAGI")}                                    `);
console.log(`  │  ${dim(`${provider.name} · ${provider.model}`)}${" ".repeat(Math.max(0, 33 - provider.name.length - provider.model.length))}`);
console.log(`  │  ${dim(`${personality.name} personality`)}${" ".repeat(Math.max(0, 33 - personality.name.length - 13))}`);
console.log(dim("  ╰─────────────────────────────────────────────╯"));
console.log(dim(`  Type your questions. ${cyan("/tools")} for available tools. ${cyan('"exit"')} to quit.\n`));

while (true) {
  const input = prompt("\x1b[1mYou:\x1b[0m ");
  if (!input || input.trim().toLowerCase() === "exit") {
    console.log(dim("\n  👋 Goodbye!\n"));
    break;
  }

  if (input.trim().toLowerCase() === "/exit") {
    console.log(dim("\n  👋 Goodbye!\n"));
    break;
  }

  if (input.trim().toLowerCase() === "/tools") {
    console.log();
    console.log(bold("  Available Tools:"));
    console.log(`    ${cyan("think")}         Strategic reasoning and planning`);
    console.log(`    ${cyan("web_search")}    Search the web for current info`);
    console.log(`    ${cyan("fetch_url")}     Read a webpage in full`);
    console.log(`    ${cyan("read_file")}     Read a local file`);
    console.log(`    ${cyan("write_file")}    Write content to a file`);
    console.log(`    ${cyan("append_file")}   Append content to a file`);
    console.log(`    ${cyan("calculator")}    Evaluate math expressions`);
    console.log(`    ${cyan("save_memory")}   Save a note to long-term memory`);
    console.log(`    ${cyan("save_research")} Save research to SQLite database`);
    console.log(`    ${cyan("get_research")}  Get full research entry by ID`);
    console.log(`    ${cyan("search_history")}Search past research by keyword`);
    console.log(`    ${cyan("list_files")}    List files in a directory`);
    console.log();
    continue;
  }

  try {
    const answer = await chat(input.trim());
    console.log(dim("  ─".repeat(25)));
    console.log(renderMarkdown(answer));
    console.log(dim("  ─".repeat(25)) + "\n");
  } catch (e: any) {
    console.log(dim("  ─".repeat(25)));
    console.log(`\n  ${red("Error:")} ${e.message}\n`);
    console.log(dim("  ─".repeat(25)) + "\n");
  }
}
