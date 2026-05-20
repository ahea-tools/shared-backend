import { openaiClient } from '@/lib/openai/client';
import type { ToolConfig } from '@/lib/config/tools';

const strategicSchema = {
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
  required: ['strategicRewrite', 'whatChangedAndWhy', 'intentPreservationCheck', 'termsToReconsider', 'strongerAlternativePhrases', 'messageReadinessScore']
};

const careerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    careerPositioningSummary: { type: 'string' },
    transferableValueMap: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { experience: { type: 'string' }, transferableValue: { type: 'string' }, whereItApplies: { type: 'string' } }, required: ['experience', 'transferableValue', 'whereItApplies'] } },
    experienceReframe: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { currentFraming: { type: 'string' }, strongerPositioning: { type: 'string' }, whyItWorks: { type: 'string' } }, required: ['currentFraming', 'strongerPositioning', 'whyItWorks'] } },
    roleAndOpportunityFit: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { potentialDirection: { type: 'string' }, whyItFits: { type: 'string' }, howToPositionExperience: { type: 'string' }, gapOrCaution: { type: 'string' } }, required: ['potentialDirection', 'whyItFits', 'howToPositionExperience', 'gapOrCaution'] } },
    talkingPoints: { type: 'object', additionalProperties: false, properties: { shortVersion: { type: 'string' }, thirtySecondVersion: { type: 'string' }, interviewReadyVersion: { type: 'string' } }, required: ['shortVersion', 'thirtySecondVersion', 'interviewReadyVersion'] },
    suggestedNextStep: { type: 'array', items: { type: 'string' } }
  },
  required: ['careerPositioningSummary', 'transferableValueMap', 'experienceReframe', 'roleAndOpportunityFit', 'talkingPoints', 'suggestedNextStep']
};

export async function runGeneration(tool: ToolConfig, input: string) {
  const isCareer = tool.toolId === 'career-positioning';
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
        name: isCareer ? 'career_positioning_output' : 'strategic_messaging_output',
        schema: isCareer ? careerSchema : strategicSchema,
        strict: true
      }
    }
  });
  return { outputText: response.output_text, responseId: response.id };
}
