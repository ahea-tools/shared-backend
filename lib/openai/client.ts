import OpenAI from 'openai';
import { getEnv } from '@/lib/config/env';
export const openaiClient = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
