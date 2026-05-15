import { z } from 'zod';

export const emailSchema = z.object({ email: z.string().email() });
export const verifySchema = z.object({ token: z.string().min(1), type: z.enum(['magiclink', 'otp']).default('otp') });

export const strategicMessagingOutputSchema = z.object({
  strategicRewrite: z.string(),
  whatChangedAndWhy: z.array(z.string()),
  intentPreservationCheck: z.string(),
  termsToReconsider: z.array(z.object({
    originalWording: z.string(),
    whyReconsider: z.string(),
    suggestedFraming: z.string()
  })),
  strongerAlternativePhrases: z.array(z.string()),
  messageReadinessScore: z.object({
    rating: z.enum(['Strong', 'Solid with minor refinements', 'Needs refinement']),
    clarity: z.string(),
    audienceFit: z.string(),
    concreteOutcomes: z.string(),
    substancePreserved: z.string()
  })
});

export const strategicMessagingInputSchema = z.object({
  message: z.string().min(1, 'Message is required.'),
  audience: z.string().min(1, 'Audience is required.'),
  mode: z.string().min(1, 'Mode is required.'),
  goalContext: z.string().optional(),
  followUpAction: z.string().optional(),
  currentOutput: strategicMessagingOutputSchema.optional()
});

export const generateSchema = z.object({
  toolId: z.string().min(1),
  input: z.unknown(),
  outputSchema: z.record(z.any()).optional(),
  generationOptions: z.record(z.any()).optional()
});

export const redeemAccessCodeSchema = z.object({ code: z.string().min(3).max(128) });
