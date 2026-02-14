// ============================================
// TOOLS - Functions your agent can use
// ============================================

import { saveResearch, searchHistory, getResearch } from "./db";
import { appendFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";

// --- Tool Schemas (what the LLM sees) ---

export const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "think",
      description: `Use this tool to plan your research strategy, reflect on findings, and decide next steps. This is your internal scratchpad.

Use it:
- BEFORE searching: plan which angles to cover, estimate depth needed
- BETWEEN searches: assess what you found, identify gaps, decide whether to go deeper or pivot
- BEFORE answering: verify you have enough coverage and your sources are solid

This tool has no side effects — it just helps you reason strategically.`,
      parameters: {
        type: "object",
        properties: {
          thought: {
            type: "string",
            description: "Your strategic reasoning — what you know, what's missing, what to do next",
          },
        },
        required: ["thought"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the web for current information. Use this when you need up-to-date facts, news, or data.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query — be specific and targeted",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_memory",
      description: "Save something important to long-term memory. This persists across sessions. Use this to remember user preferences, key facts discovered, useful research shortcuts, or anything worth knowing next time. IMPORTANT: When the user provides specific text to save, save their exact words — do not rephrase or embellish.",
      parameters: {
        type: "object",
        properties: {
          note: {
            type: "string",
            description: "The note to save. Be concise and specific. e.g. 'User prefers bullet points over prose' or 'UK net migration was 685k in Dec 2023 (Home Office)'",
          },
        },
        required: ["note"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a local file. Creates the file if it doesn't exist, overwrites if it does.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to write to",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_url",
      description: "Fetch the full content of a specific URL. Use this to read articles, documentation, or any webpage in full.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "append_file",
      description: "Append content to the end of a file. Creates the file if it doesn't exist. Use this for adding to logs, notes, or building up documents incrementally.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to append to",
          },
          content: {
            type: "string",
            description: "The content to append",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculator",
      description: "Evaluate a math expression and return the result. Supports basic arithmetic (+, -, *, /), exponents (**), parentheses, and Math functions like Math.sqrt(), Math.round(), Math.PI, etc.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The math expression to evaluate, e.g. '(100 * 1.15) / 12' or 'Math.sqrt(144)'",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the contents of a local file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to read",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_research",
      description: "Save a research query and its answer to the local database. Use this after completing a research task so the user can find it later. Always rate credibility based on source quality.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The original research question",
          },
          answer: {
            type: "string",
            description: "The research findings/answer",
          },
          credibility: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Source credibility rating. high = primary sources (.gov, .edu, WHO, peer-reviewed). medium = reputable news/industry sites. low = blogs, social media, unverified claims.",
          },
          sources: {
            type: "string",
            description: "Comma-separated list of source URLs used",
          },
        },
        required: ["query", "answer", "credibility"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_research",
      description: "Retrieve the full text of a saved research entry by its ID. Use search_history first to find relevant entries, then get_research to read the full answer.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The research entry ID (shown as [id:N] in search_history results)",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_history",
      description: "Search past research by keyword. Returns up to 5 most recent matching results from the local database.",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "The keyword to search for in past research queries and answers",
          },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List files in a directory. Useful for exploring project structure or finding files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The directory path to list (defaults to current directory)",
          },
        },
        required: [],
      },
    },
  },
];

// --- Tool Handlers (what actually runs) ---

type ToolHandler = (args: Record<string, string | undefined>) => Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
  think: async (_args) => {
    // The think tool doesn't do anything external — it just lets the LLM
    // reason in a structured way. The thought is already in the conversation
    // history, so the LLM can reference it in future turns.
    return "Strategy noted. Continue with your plan.";
  },

  web_search: async ({ query = "" }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return "Error: TAVILY_API_KEY not set in .env";
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      // Sanitize error - don't leak API keys
      const sanitized = error.replace(/tvly-[a-zA-Z0-9]+/g, "tvly-***")
                             .replace(/"api_key"\s*:\s*"[^"]*"/g, '"api_key": "***"')
                             .slice(0, 200);
      return `Search error (${response.status}): ${sanitized}`;
    }

    const data = (await response.json()) as {
      answer?: string;
      results: { title: string; url: string; content: string }[];
    };

    let output = "";

    if (data.answer) {
      output += `Summary: ${data.answer}\n\n`;
    }

    for (const result of data.results) {
      const snippet = result.content.length > 300
        ? result.content.slice(0, 300) + "..."
        : result.content;
      output += `Title: ${result.title}\n`;
      output += `URL: ${result.url}\n`;
      output += `${snippet}\n\n`;
    }

    return output;
  },

  save_memory: async ({ note = "" }) => {
    try {
      const file = Bun.file("local/memory.md");
      const existing = await file.exists() ? await file.text() : "";
      const timestamp = new Date().toISOString().split("T")[0];
      await Bun.write("local/memory.md", existing + `- [${timestamp}] ${note}\n`);
      return `Memory saved.`;
    } catch (error) {
      return `Error saving memory: ${error}`;
    }
  },

  fetch_url: async ({ url = "" }) => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RawAGI/1.0)" },
      });
      if (!response.ok) {
        return `Fetch error (${response.status}): ${response.statusText}`;
      }
      const html = await response.text();
      // Strip HTML tags to get readable text
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return text.length > 8000 ? text.slice(0, 8000) + "\n\n[truncated]" : text;
    } catch (error) {
      return `Error fetching URL: ${error}`;
    }
  },

  write_file: async ({ path = "", content = "" }) => {
    try {
      await Bun.write(path, content);
      return `File written: ${path}`;
    } catch (error) {
      return `Error writing file: ${error}`;
    }
  },

  calculator: async ({ expression = "" }) => {
    try {
      // Only allow safe math characters and Math functions
      if (!/^[\d\s+\-*/().,%eE^Math.a-z]+$/i.test(expression)) {
        return "Error: Invalid characters in expression. Only numbers, operators, and Math functions allowed.";
      }
      const result = new Function(`"use strict"; return (${expression})`)();
      return `${expression} = ${result}`;
    } catch (error) {
      return `Error evaluating expression: ${error}`;
    }
  },

  append_file: async ({ path = "", content = "" }) => {
    try {
      await appendFile(path, content);
      return `Content appended to: ${path}`;
    } catch (error) {
      return `Error appending to file: ${error}`;
    }
  },

  read_file: async ({ path = "" }) => {
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return `Error: File not found: ${path}`;
      }
      return await file.text();
    } catch (error) {
      return `Error reading file: ${error}`;
    }
  },

  save_research: async ({ query = "", answer = "", credibility = "medium", sources = "" }) => {
    try {
      saveResearch(query, answer, credibility, sources);
      return `Research saved to database. [credibility: ${credibility}]`;
    } catch (error) {
      return `Error saving research: ${error}`;
    }
  },

  get_research: async ({ id = "" }) => {
    try {
      return getResearch(parseInt(id));
    } catch (error) {
      return `Error retrieving research: ${error}`;
    }
  },

  search_history: async ({ keyword = "" }) => {
    try {
      return searchHistory(keyword);
    } catch (error) {
      return `Error searching history: ${error}`;
    }
  },

  list_files: async ({ path = "." }) => {
    try {
      const files = await readdir(path);
      return files.join("\n");
    } catch (error) {
      return `Error listing directory: ${error}`;
    }
  },
};
