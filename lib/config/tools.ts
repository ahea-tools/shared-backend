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
  'career-positioning': { toolId: 'career-positioning', displayName: 'Career Positioning', maxInputChars: 12000, model: 'gpt-4.1-mini', maxOutputTokens: 900, temperature: 0.4, systemPrompt: 'You are an AHEA assistant for career positioning content.' },
  'opportunity-finder': { toolId: 'opportunity-finder', displayName: 'Opportunity Finder', maxInputChars: 10000, model: 'gpt-4.1-mini', maxOutputTokens: 850, temperature: 0.3, systemPrompt: 'You identify relevant opportunities with concise rationale.' },
  'funding-narrative': { toolId: 'funding-narrative', displayName: 'Funding Narrative', maxInputChars: 12000, model: 'gpt-4.1-mini', maxOutputTokens: 1000, temperature: 0.3, systemPrompt: 'You are an AHEA assistant for funding narratives.' }
};
export const getTool = (toolId: string) => toolRegistry[toolId];
