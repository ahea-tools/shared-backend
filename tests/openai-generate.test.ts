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
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('uses outputText when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r0', outputText: '{"z":0}', status: 'completed', usage: { output_tokens: 77 } });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"z":0}');
    expect(result.metadata.outputTokens).toBe(77);
  });

  it('uses output_text when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r1', output_text: '{"a":1}' });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"a":1}');
  });

  it('returns null outputText when no extractable output exists', async () => {
    createMock.mockResolvedValueOnce({ id: 'r4', output: [{ content: [{ type: 'reasoning' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBeNull();
  });

  it('does not report extractionMethod output_text when returned output is empty', async () => {
    createMock.mockResolvedValueOnce({ id: 'r5', output_text: '   ', output: [{ content: [{ type: 'reasoning' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBeNull();
    const diagnosticsCall = infoSpy.mock.calls.find((call) => call[0] === '[openai/generate] response_extraction');
    const diagnostics = diagnosticsCall?.[1] as Record<string, unknown>;
    expect(diagnostics.returnedOutputTextNonEmpty).toBe(false);
    expect(diagnostics.extractionMethod).not.toBe('output_text');
  });
});

describe('runGeneration request config', () => {
  it('passes strict json schema format for career-positioning', async () => {
    createMock.mockResolvedValueOnce({ id: 'r6', outputText: '{"z":1}' });
    await runGeneration(tool, 'hello');
    const arg = createMock.mock.calls[0][0];
    expect(arg.max_output_tokens).toBe(tool.maxOutputTokens);
    expect(arg.text?.format?.type).toBe('json_schema');
    expect(arg.text?.format?.strict).toBe(true);
    expect(arg.text?.format?.name).toBe('career_positioning_output');
  });
});
