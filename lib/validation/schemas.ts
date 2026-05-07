import { z } from 'zod';

export const emailSchema = z.object({ email: z.string().email() });
export const verifySchema = z.object({ token: z.string().min(1), type: z.enum(['magiclink', 'otp']).default('otp') });
export const generateSchema = z.object({
  toolId: z.string().min(1),
  input: z.string().min(1),
  outputSchema: z.record(z.any()).optional(),
  generationOptions: z.record(z.any()).optional()
});
export const redeemAccessCodeSchema = z.object({ code: z.string().min(3).max(128) });
