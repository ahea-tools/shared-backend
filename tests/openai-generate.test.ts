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
    createMock.mockResolvedValueOnce({ id: 'r0', outputText: '{"z":0}' });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"z":0}');
  });

  it('uses output_text when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r1', output_text: '{"a":1}' });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"a":1}');
  });

  it('falls back from empty output_text to nested content text', async () => {
    createMock.mockResolvedValueOnce({ id: 'r1b', output_text: '   ', output: [{ content: [{ type: 'output_text', text: '{"a":2}' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"a":2}');
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

  it('uses parsed string content when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r3b', output: [{ content: [{ type: 'output_json', parsed: '{"d":4}' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"d":4}');
  });

  it('uses output_text typed content item text when present', async () => {
    createMock.mockResolvedValueOnce({ id: 'r3c', output: [{ content: [{ type: 'output_text', text: '{"e":5}' }] }] });
    const result = await runGeneration(tool, 'hello');
    expect(result.outputText).toBe('{"e":5}');
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
