export type ToolConfig = {
  toolId: string;
  displayName: string;
  maxInputChars: number;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  systemPrompt: string;
  allowedOrigins?: string[];
};

export const toolRegistry: Record<string, ToolConfig> = {
  'strategic-messaging': { toolId: 'strategic-messaging', displayName: 'Strategic Messaging', maxInputChars: 12000, model: 'gpt-4.1-mini', maxOutputTokens: 800, temperature: 0.4, systemPrompt: 'You are an AHEA assistant for strategic messaging.' },
  'grant-narrative': { toolId: 'grant-narrative', displayName: 'Grant Narrative', maxInputChars: 12000, model: 'gpt-4.1-mini', maxOutputTokens: 1000, temperature: 0.3, systemPrompt: 'You are an AHEA assistant for grant narrative writing.' },
  'board-brief': { toolId: 'board-brief', displayName: 'Board Brief', maxInputChars: 10000, model: 'gpt-4.1-mini', maxOutputTokens: 700, temperature: 0.2, systemPrompt: 'You produce concise board-ready briefings.' },
  'community-update': { toolId: 'community-update', displayName: 'Community Update', maxInputChars: 10000, model: 'gpt-4.1-mini', maxOutputTokens: 700, temperature: 0.4, systemPrompt: 'You draft clear community updates for public-health audiences.' }
};

export const getTool = (toolId: string) => toolRegistry[toolId];
