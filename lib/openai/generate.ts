import { openaiClient } from '@/lib/openai/client';
import type { ToolConfig } from '@/lib/config/tools';

export async function runGeneration(tool: ToolConfig, input: string) {
  const response = await openaiClient.responses.create({
    model: tool.model,
    temperature: tool.temperature,
    max_output_tokens: tool.maxOutputTokens,
    input: [
      { role: 'system', content: tool.systemPrompt },
      { role: 'user', content: input }
    ]
  });
  return { outputText: response.output_text };
}
