// ============================================
// ROUTER - Routes queries to the appropriate agent
// ============================================

import type { AgentKey } from "./agent";

// Keyword patterns for routing
const patterns: Record<AgentKey, RegExp[]> = {
  code: [
    /build|create|make|write/i,
    /website|web site|html|css|javascript|typescript/i,
    /code|program|app|application/i,
    /\.(html|css|js|ts|tsx|jsx)$/,
    /file.*\.(html|css|js|ts)/i,
    /frontend|backend|fullstack/i,
  ],
  research: [
    /research|find|search/i,
    /what is|who is|when did|where is/i,
    /latest|news|recent/i,
    /explain|describe|define/i,
    /history|background|overview/i,
    /information|facts|details/i,
  ],
  reasoning: [
    /analyze|analysis/i,
    /compare|contrast/i,
    /explain why|reason/i,
    /plan|strategy/i,
    /think about|consider/i,
    /advantage|disadvantage|pros|cons/i,
  ],
  general: [],
};

let lastAgent: AgentKey = "general";

export async function route(query: string): Promise<AgentKey> {
  const lowerQuery = query.toLowerCase().trim();

  // Short/vague messages are follow-ups — stay with last agent
  if (lowerQuery.length < 30 && !lowerQuery.includes("?")) {
    const hasKeyword = [...patterns.code, ...patterns.research, ...patterns.reasoning]
      .some(p => p.test(lowerQuery));
    if (!hasKeyword) {
      return lastAgent;
    }
  }

  // Check code patterns first (most specific)
  for (const pattern of patterns.code) {
    if (pattern.test(lowerQuery)) {
      lastAgent = "code";
      return "code";
    }
  }

  // Check research patterns
  for (const pattern of patterns.research) {
    if (pattern.test(lowerQuery)) {
      lastAgent = "research";
      return "research";
    }
  }

  // Check reasoning patterns
  for (const pattern of patterns.reasoning) {
    if (pattern.test(lowerQuery)) {
      lastAgent = "reasoning";
      return "reasoning";
    }
  }

  // Default to general
  lastAgent = "general";
  return "general";
}

export function listAgents(): string {
  return `Available agents:
  - research:   Research and information gathering (uses DeepSeek)
  - code:      Building websites and coding (uses MiniMax)
  - reasoning: Analysis and deep thinking (uses Gemini)
  - general:   General purpose assistant (uses DeepSeek)

Use "/use <agent>" to force a specific agent.`;
}
