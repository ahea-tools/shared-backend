import { describe, it, expect } from 'vitest';
import { getTool } from '@/lib/config/tools';

describe('tool config', () => {
  it('career-positioning max output tokens are adequately bounded', () => {
    const tool = getTool('career-positioning');
    expect(tool).toBeTruthy();
    expect(tool?.maxOutputTokens).toBeGreaterThanOrEqual(3500);
    expect(tool?.maxOutputTokens).toBeLessThanOrEqual(4000);
  });
});
