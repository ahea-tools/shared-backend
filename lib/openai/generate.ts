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
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'strategic_messaging_output',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            strategicRewrite: { type: 'string' },
            whatChangedAndWhy: { type: 'array', items: { type: 'string' } },
            intentPreservationCheck: { type: 'string' },
            termsToReconsider: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  originalWording: { type: 'string' },
                  whyReconsider: { type: 'string' },
                  suggestedFraming: { type: 'string' }
                },
                required: ['originalWording', 'whyReconsider', 'suggestedFraming']
              }
            },
            strongerAlternativePhrases: { type: 'array', items: { type: 'string' } },
            messageReadinessScore: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rating: { type: 'string', enum: ['Strong', 'Solid with minor refinements', 'Needs refinement'] },
                clarity: { type: 'string' },
                audienceFit: { type: 'string' },
                concreteOutcomes: { type: 'string' },
                substancePreserved: { type: 'string' }
              },
              required: ['rating', 'clarity', 'audienceFit', 'concreteOutcomes', 'substancePreserved']
            }
          },
          required: [
            'strategicRewrite',
            'whatChangedAndWhy',
            'intentPreservationCheck',
            'termsToReconsider',
            'strongerAlternativePhrases',
            'messageReadinessScore'
          ]
        },
        strict: true
      }
    }
  });
  return { outputText: response.output_text, responseId: response.id };
}
