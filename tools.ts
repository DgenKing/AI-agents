// ============================================
// TOOLS - Functions your agent can use
// ============================================

// --- Tool Schemas (what the LLM sees) ---

export const toolSchemas = [
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
            description: "The search query",
          },
        },
        required: ["query"],
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
];

// --- Tool Handlers (what actually runs) ---

type ToolHandler = (args: Record<string, string>) => Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
  web_search: async ({ query }) => {
    console.log(`  🔍 Searching: "${query}"`);

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
      return `Search error (${response.status}): ${error}`;
    }

    const data = await response.json();

    // Format the results into clean text for the LLM
    let output = "";

    if (data.answer) {
      output += `Summary: ${data.answer}\n\n`;
    }

    for (const result of data.results) {
      output += `Title: ${result.title}\n`;
      output += `URL: ${result.url}\n`;
      output += `${result.content}\n\n`;
    }

    return output;
  },

  read_file: async ({ path }) => {
    console.log(`  📄 Reading file: ${path}`);
    try {
      const file = Bun.file(path);
      return await file.text();
    } catch (error) {
      return `Error reading file: ${error}`;
    }
  },
};
