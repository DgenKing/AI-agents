// ============================================
// AGENT - Loop, profiles, and prompts in one file
// ============================================
// The entire agent system. No frameworks. No magic.
//
// 1. Send messages + tools to the LLM
// 2. If the LLM wants to call a tool → run it, send result back
// 3. If the LLM gives a final text answer → we're done
// 4. Repeat until finished (with a safety limit)

import type { Provider } from "./providers";
import { providers, getFullURL, getAuthHeaders } from "./providers";
import { toolSchemas, toolHandlers } from "./tools";

// --- Pretty terminal colors ---
const c = {
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

// ============================================
// TYPES (matching OpenAI-compatible format)
// ============================================

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

type ChatResponse = {
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
  };
};

// ============================================
// AGENT PROFILES
// ============================================

// Tool subsets for different agent types
const allTools = toolSchemas;
const fileTools = toolSchemas.filter(t =>
  ["read_file", "write_file", "append_file", "list_files", "calculator"].includes(t.function.name)
);
const researchTools = toolSchemas.filter(t =>
  ["think", "web_search", "fetch_url", "save_research", "get_research", "search_history", "calculator"].includes(t.function.name)
);
const minimalTools = toolSchemas.filter(t =>
  ["think", "calculator"].includes(t.function.name)
);

export type AgentKey = "research" | "code" | "reasoning" | "general";

export type Agent = {
  name: string;
  provider: Provider;
  systemPrompt: string;
  tools: typeof toolSchemas;
  description: string;
};

// --- Agent Prompts ---

const researchPrompt = `You are a Research Specialist AI agent with dynamic strategy selection.

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

## Memory
You have persistent memory across sessions via the save_memory tool.

Save a memory when you:
- Learn a user preference ("user prefers concise bullet points")
- Discover a key fact worth remembering ("UK net migration was 685k in Dec 2023")
- Find a useful research shortcut ("site:gov.uk is best for UK policy")

CRITICAL: When the user tells you to save specific text, save their EXACT words. Do not rephrase, embellish, or invent your own version. If the user says "save X", you save X — not your interpretation of X.

Do NOT save memory for every query — only things genuinely worth remembering long-term.

You have access to tools. Use them strategically, not mechanically.`;

const codePrompt = `You are a Code Specialist AI agent focused on building websites, applications, and working with local files.

## Core Capabilities

You specialize in:
- Creating websites and web applications
- Writing and modifying code files (HTML, CSS, JavaScript, TypeScript, etc.)
- Reading and analyzing existing codebases
- Debugging and fixing issues
- Building full projects from scratch

## Working with Files

IMPORTANT: Always save files to the local/ directory. This keeps user-generated files (websites, docs, exports) separate from the project source code and gitignored.
- Use write_file with paths like local/index.html, local/styles.css, etc.
- Use read_file to examine existing files
- Use append_file to add content to existing files
- Use list_files to explore directory structure

## Website Building

For website requests:
1. Start by planning the structure (HTML, CSS, JS components)
2. Create the main HTML file first
3. Add CSS for styling
4. Add JavaScript for interactivity
5. Test by reading back the files to verify

## Code Quality

- Write clean, modern code
- Use semantic HTML
- Make websites responsive
- Add appropriate error handling
- Comment complex logic

## Output Rules

- Show the user what files you created/modified
- Explain what the code does
- If something doesn't work, debug and fix it
- Be proactive in suggesting improvements

You have access to tools. Use them to build and verify your work.`;

const reasoningPrompt = `You are an Analysis and Reasoning specialist AI agent.

Your role is to think deeply, analyze problems, and provide thoughtful insights.

## What you do best

- Break down complex problems into components
- Compare and contrast different approaches
- Explain why certain solutions work
- Analyze trade-offs and implications
- Plan strategic approaches to problems

## How to approach queries

1. First, use the "think" tool to structure your analysis
2. Consider multiple perspectives and approaches
3. Identify the key factors and variables
4. Evaluate pros and cons
5. Provide clear reasoning for your conclusions

## When to use tools

- Use calculator for any math or computations
- Use think for planning your analysis approach
- Avoid using web_search unless the user specifically asks for current information
- Focus on reasoning and analysis rather than gathering external data

## Output Rules

- Structure your analysis clearly
- Show your reasoning process
- Be thorough but concise
- Use examples where helpful
- Distinguish between facts and interpretations

You have access to tools. Use them to support your analysis.`;

const generalPrompt = `You are a helpful AI assistant with access to various tools.

## Your capabilities

You can help with:
- Research and information gathering
- Writing and editing content
- Answering questions
- Working with files (always save to local/ directory)
- Calculations and analysis
- And much more!

## How to help

1. Understand what the user wants
2. Use appropriate tools when needed
3. Provide clear, accurate responses
4. Ask clarifying questions when needed

## Output Rules

- Match your response to what the user needs
- Be clear and concise
- Use tools strategically
- If you make mistakes, acknowledge and correct them

You have access to tools. Use them as needed to help the user.`;

// --- Build system prompt with memory injection ---

export function getAgentSystemPrompt(agentKey: AgentKey, memory: string, bunRef: string): string {
  const memorySection = memory.trim()
    ? `\n## Your Memory (from previous sessions)\n${memory.trim()}\n`
    : "";
  const bunRefSection = bunRef.trim()
    ? `\n## Bun API Reference (verified local docs)\nThe following APIs are CONFIRMED to exist in this project's Bun runtime. When suggesting code improvements, use ONLY these APIs.\n${bunRef.trim()}\n`
    : "";

  const basePrompts: Record<AgentKey, string> = {
    research: researchPrompt,
    code: codePrompt,
    reasoning: reasoningPrompt,
    general: generalPrompt,
  };

  return basePrompts[agentKey] + memorySection + bunRefSection;
}

// --- Agent configs ---

export const agents: Record<AgentKey, Agent> = {
  research: {
    name: "Research Agent",
    provider: providers.deepseek,
    systemPrompt: researchPrompt,
    tools: researchTools,
    description: "Research and information gathering",
  },
  code: {
    name: "Code Agent",
    provider: providers.minimax,
    systemPrompt: codePrompt,
    tools: fileTools,
    description: "Building websites and coding",
  },
  reasoning: {
    name: "Reasoning Agent",
    provider: providers.deepseek,
    systemPrompt: reasoningPrompt,
    tools: minimalTools,
    description: "Analysis and deep thinking",
  },
  general: {
    name: "General Agent",
    provider: providers.deepseek,
    systemPrompt: generalPrompt,
    tools: allTools,
    description: "General purpose assistant",
  },
};

// ============================================
// API CALL
// ============================================

async function callLLM(
  provider: Provider,
  messages: Message[],
  tools: typeof toolSchemas = toolSchemas
): Promise<ChatResponse> {
  const url = getFullURL(provider);
  const headers = getAuthHeaders(provider);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    const sanitized = error.replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
                           .replace(/"api_key"\s*:\s*"[^"]*"/g, '"api_key": "***"')
                           .replace(/AIzaSy[a-zA-Z0-9_-]+/g, "AIzaSy***")
                           .slice(0, 500);
    throw new Error(`API error (${response.status}): ${sanitized}`);
  }

  return response.json() as Promise<ChatResponse>;
}

// ============================================
// FILE WRITE APPROVAL
// ============================================

const APPROVAL_TOOLS = ["write_file", "append_file"];

function requestApproval(toolName: string, args: Record<string, string | undefined>): boolean {
  const path = args.path || "unknown";
  const content = args.content || "";
  const sizeKB = (content.length / 1024).toFixed(1);
  const preview = content.slice(0, 300).replace(/\n/g, "\\n");

  console.log(c.yellow(`    ⚠️  ${toolName.toUpperCase()} → ${path} (${sizeKB}KB)`));
  console.log(c.dim(`    Preview: ${preview}${content.length > 300 ? "..." : ""}`));

  const answer = prompt(c.yellow("    Approve? (y/n): "));
  return answer?.trim().toLowerCase() === "y";
}

// ============================================
// THE AGENT LOOP
// ============================================

export function createChat(
  provider: Provider,
  systemPrompt: string,
  tools: typeof toolSchemas = toolSchemas,
  maxIterations: number = 25
) {
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
  ];

  return async function chat(userMessage: string): Promise<string> {
    messages.push({ role: "user", content: userMessage });

    let totalIn = 0, totalOut = 0, totalCached = 0;
    const startTime = performance.now();
    console.log();

    for (let i = 0; i < maxIterations; i++) {
      console.log(c.dim(`  ● Step ${i + 1} ${"─".repeat(40)}`));

      const response = await callLLM(provider, messages, tools);

      // Token tracking
      let tokenLine = "";
      if (response.usage) {
        const u = response.usage;
        totalIn += u.prompt_tokens;
        totalOut += u.completion_tokens;
        totalCached += u.prompt_cache_hit_tokens || 0;
        const cacheRate = u.prompt_cache_hit_tokens
          ? ((u.prompt_cache_hit_tokens / u.prompt_tokens) * 100).toFixed(0)
          : "0";
        tokenLine = c.dim(`    📊 ${u.prompt_tokens.toLocaleString()} in │ ${u.completion_tokens.toLocaleString()} out │ ${cacheRate}% cached`);
      }

      const choice = response.choices[0];
      if (!choice) throw new Error("No response from LLM");
      const assistantMessage = choice.message;

      messages.push(assistantMessage as Message);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          // Pretty tool-specific output
          if (toolName === "think") {
            const thought = toolArgs.thought || "";
            console.log(`    💭 ${c.magenta(thought.slice(0, 100))}${thought.length > 100 ? c.dim("...") : ""}`);
          } else if (toolName === "web_search") {
            console.log(`    🔍 ${c.cyan(`"${toolArgs.query}"`)}`);
          } else {
            console.log(`    🔧 ${c.yellow(toolName)}(${JSON.stringify(toolArgs)})`);
          }

          const handler = toolHandlers[toolName];
          if (!handler) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: Unknown tool "${toolName}"`,
            });
            console.log(`    ${c.red("✗ Unknown tool")}`);
            continue;
          }

          // Check if this tool needs user approval
          if (APPROVAL_TOOLS.includes(toolName) && !requestApproval(toolName, toolArgs)) {
            const denied = `User denied ${toolName} to: ${toolArgs.path || "unknown"}`;
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: denied });
            console.log(c.red(`    ✗ Denied`));
            continue;
          }

          const toolStart = performance.now();
          const result = await handler(toolArgs);
          const elapsed = ((performance.now() - toolStart) / 1000).toFixed(2);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });

          if (toolName !== "think") {
            console.log(c.dim(`    ✓ ${elapsed}s`));
          }
        }
        if (tokenLine) console.log(tokenLine);
      } else {
        const answer = assistantMessage.content || "No response";
        const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
        const overallCache = totalIn > 0 ? ((totalCached / totalIn) * 100).toFixed(0) : "0";
        console.log();
        console.log(c.green(`  ✅ Done in ${i + 1} steps (${totalTime}s)`));
        console.log(c.dim(`  📊 Total: ${totalIn.toLocaleString()} in │ ${totalOut.toLocaleString()} out │ ${overallCache}% cached`));
        console.log();
        return answer;
      }
    }

    return "Reached max iterations.";
  };
}
