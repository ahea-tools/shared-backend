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

const careerOutputTypeSchema = z.enum([
  'resume_summary','linkedin_about','professional_bio','interview_networking','career_transition','consulting_independent'
]);
const currentWorkSchema = z.enum([
  'public_health_programs','health_equity_community_health','research_data_evaluation','policy_advocacy_systems_change','communications_strategy_public_affairs','healthcare_population_health_social_care','nonprofit_philanthropy_community_based','other_mixed'
]);
const desiredDirectionSchema = z.enum([
  'similar_field','different_sector','leadership_role','consulting_independent','broader_public_health_strategy_systems','not_sure'
]);
const emphasisItemSchema = z.enum([
  'leadership_decision_making','transferable_skills','program_project_results','community_partnership_trust','strategy_policy_systems','communication_stakeholder_engagement','adaptability_during_change'
]);
const professionalContextSchema = z.enum([
  'direct_values_forward','balanced_broadly_accessible','careful_institutionally_appropriate','cross_sector_unfamiliar_audience','recommend_best_fit'
]);

export const careerPositioningInputSchema = z.object({
  outputType: careerOutputTypeSchema,
  currentLanguage: z.string().min(50, 'Current language must be at least 50 characters.').max(6000, 'Current language exceeds max length.'),
  currentWork: currentWorkSchema,
  desiredDirection: desiredDirectionSchema,
  emphasis: z.array(emphasisItemSchema).min(1, 'Select at least one emphasis.').max(3, 'Select at most three emphasis areas.'),
  professionalContext: professionalContextSchema,
  additionalContext: z.string().max(2000, 'Additional context exceeds max length.').optional()
});

export const careerPositioningOutputSchema = z.object({
  careerPositioningSummary: z.string().min(1),
  transferableValueMap: z.array(z.object({
    experience: z.string().min(1),
    transferableValue: z.string().min(1),
    whereItApplies: z.string().min(1)
  })).min(3).max(5),
  experienceReframe: z.array(z.object({
    currentFraming: z.string().min(1),
    strongerPositioning: z.string().min(1),
    whyItWorks: z.string().min(1)
  })).min(3).max(5),
  roleAndOpportunityFit: z.array(z.object({
    potentialDirection: z.string().min(1),
    whyItFits: z.string().min(1),
    howToPositionExperience: z.string().min(1),
    gapOrCaution: z.string().min(1)
  })).min(3).max(5),
  talkingPoints: z.object({
    shortVersion: z.string().min(1),
    thirtySecondVersion: z.string().min(1),
    interviewReadyVersion: z.string().min(1)
  }),
  suggestedNextStep: z.array(z.string().min(1)).min(1).max(3)
});

export const generateSchema = z.object({
  toolId: z.string().min(1),
  input: z.unknown(),
  outputSchema: z.record(z.any()).optional(),
  generationOptions: z.record(z.any()).optional()
});

export const redeemAccessCodeSchema = z.object({ code: z.string().min(3).max(128) });
