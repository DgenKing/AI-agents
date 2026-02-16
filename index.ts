// ============================================
// ENTRY POINT - Run with: bun run index.ts
// ============================================

import { createChat, agents, getAgentSystemPrompt, type AgentKey } from "./agent";
import { route } from "./router";

// --- Load persistent memory ---
const memoryFile = Bun.file("local/memory.md");
const memory = await memoryFile.exists() ? await memoryFile.text() : "";

// --- Load Bun API reference (pre-processed docs for self-improvement) ---
const refFile = Bun.file("docs/bun-reference.md");
const bunRef = await refFile.exists() ? await refFile.text() : "";

const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// Current agent override (null = auto-route)
let forcedAgent: AgentKey | null = null;

// Render markdown to ANSI terminal colors
function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, `\x1b[36m$1\x1b[0m`)           // ### heading → cyan
    .replace(/^## (.+)$/gm, `\x1b[1m\x1b[36m$1\x1b[0m`)    // ## heading → bold cyan
    .replace(/^# (.+)$/gm, `\x1b[1m\x1b[34m$1\x1b[0m`)     // # heading → bold blue
    .replace(/\*\*(.+?)\*\*/g, `\x1b[1m$1\x1b[0m`)          // **bold**
    .replace(/`(.+?)`/g, `\x1b[33m$1\x1b[0m`);              // `code` → yellow
}

function getActiveAgentName(): string {
  if (forcedAgent) {
    return `${agents[forcedAgent].name} (forced)`;
  }
  return "Auto-routing";
}

console.log();
console.log(dim("  ╭─────────────────────────────────────────────╮"));
console.log(`  │  ⚡ ${bold("RawAGI")} Multi-Agent                      `);
console.log(`  │  ${dim("DeepSeek · MiniMax")}${" ".repeat(10)}`);
console.log(`  │  ${dim(getActiveAgentName())}${" ".repeat(20)}`);
console.log(dim("  ╰─────────────────────────────────────────────╯"));
console.log(dim(`  Type your questions. ${cyan("/tools")} for tools, ${cyan("/agents")} for agents, ${cyan("/use")} to force an agent.\n`));

// Cache chats per agent so they retain conversation history
const chatCache: Partial<Record<AgentKey, (msg: string) => Promise<string>>> = {};

while (true) {
  const input = prompt("\x1b[1mYou:\x1b[0m ");
  if (!input || input.trim().toLowerCase() === "exit") {
    console.log(dim("\n  👋 Goodbye!\n"));
    break;
  }

  const trimmed = input.trim().toLowerCase();

  // Handle commands
  if (trimmed === "/exit") {
    console.log(dim("\n  👋 Goodbye!\n"));
    break;
  }

  if (trimmed === "/tools") {
    console.log();
    console.log(bold("  Available Tools (varies by agent):"));
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

  if (trimmed === "/agents") {
    console.log();
    console.log(bold("  Available Agents:"));
    console.log(`    ${cyan("research")}   Research & info gathering (DeepSeek)`);
    console.log(`    ${cyan("code")}       Building websites & coding (MiniMax)`);
    console.log(`    ${cyan("reasoning")}  Analysis & deep thinking (DeepSeek)`);
    console.log(`    ${cyan("general")}    General purpose (DeepSeek)`);
    console.log();
    console.log(dim("  Use /use <agent> to force a specific agent.\n"));
    continue;
  }

  if (trimmed.startsWith("/use ")) {
    const agentName = trimmed.slice(5).trim() as AgentKey;
    if (agents[agentName]) {
      forcedAgent = agentName;
      console.log(dim(`\n  → Now using: ${cyan(agents[agentName].name)}\n`));
    } else {
      console.log(dim(`\n  → Unknown agent. Use: research, code, reasoning, or general\n`));
    }
    continue;
  }

  if (trimmed === "/auto") {
    forcedAgent = null;
    console.log(dim("\n  → Now using auto-routing\n"));
    continue;
  }

  try {
    // Determine which agent to use
    let agentKey: AgentKey;
    if (forcedAgent) {
      agentKey = forcedAgent;
    } else {
      agentKey = await route(input.trim());
    }

    const agent = agents[agentKey];
    console.log(dim(`  ─.repeat(25)`));
    console.log(dim(`  🤖 ${magenta(agent.name)} (${agent.provider.name})`));
    console.log(dim(`  ─.repeat(25)`));

    // Get or create cached chat for this agent
    if (!chatCache[agentKey]) {
      const systemPrompt = getAgentSystemPrompt(agentKey, memory, bunRef);
      chatCache[agentKey] = createChat(agent.provider, systemPrompt, agent.tools);
    }
    const answer = await chatCache[agentKey]!(input.trim());

    console.log(dim("  ─".repeat(25)));
    console.log(renderMarkdown(answer));
    console.log(dim("  ─".repeat(25)) + "\n");
  } catch (e: any) {
    console.log(dim("  ─".repeat(25)));
    console.log(`\n  ${red("Error:")} ${e.message}\n`);
    console.log(dim("  ─".repeat(25)) + "\n");
  }
}
