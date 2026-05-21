import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn()
}));

vi.mock('@/lib/openai/client', () => ({
  openaiClient: {
    responses: {
      create: createMock
    }
  }
}));

import { runGeneration } from '@/lib/openai/generate';

const tool = {
  toolId: 'career-positioning',
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  maxOutputTokens: 500,
  systemPrompt: 'test prompt',
  maxInputChars: 10000
} as any;

describe('runGeneration extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses output_text when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r1', output_text: '{"a":1}' });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"a":1}');
  });

  it('uses nested content text when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r2', output: [{ content: [{ type: 'output_text', text: '{"b":2}' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"b":2}');
  });

  it('uses parsed structured content when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r3', output: [{ content: [{ type: 'output_json', parsed: { c: 3 } }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"c":3}');
  });

  it('returns null outputText when no extractable output exists', async () => {
    createMock.mockResolvedValueOnce({ id: 'r4', output: [{ content: [{ type: 'reasoning' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBeNull();
  });
});
