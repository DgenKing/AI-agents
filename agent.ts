// ============================================
// AGENT LOOP - The core of everything
// ============================================
// This is the entire agent in one function.
// No frameworks. No magic. Just a loop:
//
// 1. Send messages + tools to the LLM
// 2. If the LLM wants to call a tool → run it, send result back
// 3. If the LLM gives a final text answer → we're done
// 4. Repeat until finished (with a safety limit)
//
// That's it. That's what every AI agent framework
// is doing under the hood. Now you can see it.

import type { Provider } from "./providers";
import { toolSchemas, toolHandlers } from "./tools";

// --- Types (matching OpenAI-compatible format) ---

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
};

// --- The actual API call ---

async function callLLM(
  provider: Provider,
  messages: Message[]
): Promise<ChatResponse> {
  const response = await fetch(
    `${provider.baseURL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        tools: toolSchemas,
        tool_choice: "auto", // Let the LLM decide when to use tools
        temperature: 0.3,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<ChatResponse>;
}

// --- The Agent Loop ---

// --- Interactive Chat (maintains conversation history) ---

export function createChat(
  provider: Provider,
  systemPrompt: string,
  maxIterations: number = 10
) {
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
  ];

  return async function chat(userMessage: string): Promise<string> {
    messages.push({ role: "user", content: userMessage });

    console.log();

    for (let i = 0; i < maxIterations; i++) {
      console.log(`--- Iteration ${i + 1} ---`);

      const response = await callLLM(provider, messages);
      const choice = response.choices[0];
      if (!choice) throw new Error("No response from LLM");
      const assistantMessage = choice.message;

      messages.push(assistantMessage as Message);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(
          `  🔧 Using ${assistantMessage.tool_calls.length} tool(s)`
        );

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`  → ${toolName}(${JSON.stringify(toolArgs)})`);

          const handler = toolHandlers[toolName];
          if (!handler) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: Unknown tool "${toolName}"`,
            });
            continue;
          }

          const result = await handler(toolArgs);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });

          console.log(`  ✅ ${toolName} done`);
        }
      } else {
        const answer = assistantMessage.content || "No response";
        console.log(`✅ Done (${i + 1} iteration(s))\n`);
        return answer;
      }
    }

    return "Reached max iterations.";
  };
}

// --- One-shot Agent (original) ---

export async function runAgent(
  provider: Provider,
  systemPrompt: string,
  userMessage: string,
  maxIterations: number = 10 // Safety limit to prevent infinite loops
): Promise<string> {
  // Build the conversation history
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  console.log(`\n🤖 Agent running on ${provider.name} (${provider.model})`);
  console.log(`📝 Task: "${userMessage}"\n`);

  for (let i = 0; i < maxIterations; i++) {
    console.log(`--- Iteration ${i + 1} ---`);

    // Step 1: Call the LLM
    const response = await callLLM(provider, messages);
    const choice = response.choices[0];
    if (!choice) throw new Error("No response from LLM");
    const assistantMessage = choice.message;

    // Add the assistant's response to conversation history
    messages.push(assistantMessage as Message);

    // Step 2: Check if the LLM wants to use tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(
        `  🔧 LLM wants to use ${assistantMessage.tool_calls.length} tool(s)`
      );

      // Run each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`  → Calling: ${toolName}(${JSON.stringify(toolArgs)})`);

        // Look up and run the tool handler
        const handler = toolHandlers[toolName];
        if (!handler) {
          // Tool not found - tell the LLM
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error: Unknown tool "${toolName}"`,
          });
          continue;
        }

        // Run the tool and get the result
        const result = await handler(toolArgs);

        // Send the result back to the LLM
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });

        console.log(`  ✅ ${toolName} completed`);
      }

      // Loop continues - LLM will see the tool results next iteration

    } else {
      // Step 3: No tool calls = LLM is giving its final answer
      const finalAnswer = assistantMessage.content || "No response";
      console.log(`\n✅ Agent finished in ${i + 1} iteration(s)\n`);
      return finalAnswer;
    }
  }

  // Safety limit reached
  return "Agent reached maximum iterations without a final answer.";
}
