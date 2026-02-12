# RawAGI — A Truth Engine in 3 Files

A framework-free AI research agent built in TypeScript/Bun. No LangChain. No abstractions. Just the raw loop that every agent framework is hiding from you.

**Tested head-to-head against ChatGPT: 6–0.** Including the hallucination killer test — it refused to cite a fake 2026 report and corrected the question with a real 2025 source.

```
  ╭─────────────────────────────────────────────╮
  │  ⚡ RawAGI                                    │
  │  DeepSeek · deepseek-chat                   │
  ╰─────────────────────────────────────────────╯
  Type your questions. "exit" to quit.

You: Is lab-grown meat approved in the US?

  ● Step 1 ────────────────────────────────
    💭 This is a policy/regulatory question — I should hit FDA/USDA primary sources...
  ● Step 2 ────────────────────────────────
    🔍 "lab grown meat FDA USDA approval status site:fda.gov"
    ✓ 1.24s
  ● Step 3 ────────────────────────────────
    💭 Red Team: Most results are from food blogs. Let me verify with a primary source...
    🔍 "cultivated meat regulatory approval 2025 site:usda.gov"
    ✓ 0.98s

  ✅ Done in 5 steps (12.3s)
  📊 Total: 14,203 in │ 847 out │ 84% cached
```

---

## How it works

The entire agent is one loop:

1. Send messages + tools to the LLM
2. If the LLM calls a tool → run it, add the result, repeat
3. If the LLM gives a text answer → done

That's it. That's what LangChain, AutoGPT, and every other framework is doing. Here it's ~200 lines of TypeScript you can actually read.

### The agent has three tools

| Tool | What it does |
|------|--------------|
| `think` | Zero-side-effect reasoning scratchpad. The LLM plans strategy, challenges findings, decides next steps. |
| `web_search` | Tavily API. Returns 5 results with trimmed snippets to keep context lean. |
| `read_file` | Read local files. |

### What makes it a "Truth Engine"

Three prompt layers that most agents skip:

**1. Dynamic Strategy Selection** — Before searching, the agent classifies the query (simple fact / current event / deep analysis / comparison) and estimates how many searches it actually needs. Simple questions get 1-2 searches. Deep analysis gets 5+. It stops when it has enough.

**2. Red Team Phase** — After initial research, the agent is forced to challenge its own findings:
- Do any sources contradict each other?
- Are all my sources from the same industry (bias)?
- What's the biggest uncertainty here?
- It must search for at least ONE source that disagrees.

**3. Primary Source Protocol** — For science, health, or policy questions, it searches `site:who.int`, `site:fda.gov`, `site:nih.gov` instead of blog aggregators. WHO > healthline.com. The actual paper > a tweet about the paper.

---

## Setup

**1. Install Bun** (if you don't have it)
```bash
curl -fsSL https://bun.sh/install | bash
```

**2. Clone and install**
```bash
git clone https://github.com/DgenKing/AI-agents.git
cd AI-agents
bun install
```

**3. Add your API keys to `.env`**
```env
# Pick any ONE to get started
DEEPSEEK_API_KEY=sk-xxx       # Recommended — cheapest, great caching
MISTRAL_API_KEY=xxx
OPENAI_API_KEY=sk-xxx
GROQ_API_KEY=gsk_xxx

# Required for web search
TAVILY_API_KEY=tvly-xxx
```

Get keys:
- [DeepSeek](https://platform.deepseek.com/) — ~$0.07/million tokens (+ 84% cache hit rate in practice)
- [Tavily](https://tavily.com/) — 1,000 free searches/month
- [Mistral](https://console.mistral.ai/) / [Groq](https://console.groq.com/) / [OpenAI](https://platform.openai.com/)

**4. Run**
```bash
bun run index.ts
```

---

## Swap providers

One line in `index.ts`:

```ts
const provider = providers.deepseek;  // ← change this
// providers.mistral
// providers.groq
// providers.openai
// providers.ollama  // free, runs locally
```

All providers use the OpenAI-compatible chat completions format — same request shape, same response shape, different URL.

---

## Project structure

```
index.ts      — Entry point. System prompt + interactive chat loop.
agent.ts      — The agent loop. ~200 lines. No magic.
tools.ts      — Tool definitions + handlers (think, web_search, read_file).
providers.ts  — LLM provider configs. Swap with one line.
```

---

## Why DeepSeek?

In testing, long research sessions (10+ iterations) run at **~84% cache hit rate**. The context grows each iteration, but DeepSeek's caching means you're mostly paying for new tokens only. A 10-iteration deep research session costs roughly the same as 2-3 uncached calls.

Token usage is displayed after every response:
```
📊 Total: 14,203 in │ 847 out │ 84% cached
```

---

## The test it won

The hardest test: ask for something that doesn't exist.

> "What did the WHO 2026 meta-analysis say about microplastics?"

ChatGPT: fabricated a plausible-sounding answer.

RawAGI: *"I cannot find a WHO 2026 meta-analysis on microplastics. The most recent WHO report I can verify is from 2025 [link]. **Confidence: High** that no 2026 report exists yet."*

That's the difference between a chatbot and a research tool.

---

## Built with

- [Bun](https://bun.sh) — TypeScript runtime, no build step needed
- [DeepSeek](https://deepseek.com) — Primary LLM (swappable)
- [Tavily](https://tavily.com) — Web search API
- Zero frameworks. Zero abstractions. Just the loop.
