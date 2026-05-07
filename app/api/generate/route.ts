import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { blockedResponse, FREE_GENERATIONS_LIMIT, successResponse } from '@/lib/responses/api-responses';
import { generateSchema } from '@/lib/validation/schemas';
import { getTool } from '@/lib/config/tools';
import { runGeneration } from '@/lib/openai/generate';
import { getEnv } from '@/lib/config/env';

export async function POST(req: NextRequest) {
  const parsed = generateSchema.safeParse(await req.json());
  if (!parsed.success) return blockedResponse('invalid_request', 'Invalid generation request.');
  const tool = getTool(parsed.data.toolId);
  if (!tool) return blockedResponse('invalid_tool', 'The requested tool is not available.');
  if (parsed.data.input.length > tool.maxInputChars) return blockedResponse('invalid_request', 'Input exceeds allowed length for this tool.');
  const result = await runGeneration(tool, parsed.data.input);
  return successResponse({ requestId: crypto.randomUUID(), toolId: tool.toolId, data: { output: result.outputText }, usage: { generationsUsed: 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: 2, accessStatus: 'free' } });
}
