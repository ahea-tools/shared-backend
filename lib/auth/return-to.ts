const APPROVED_RETURN_ORIGINS = new Set([
  'https://strategic-messaging.americanhealthequity.org',
  'https://career-positioning.americanhealthequity.org',
  'https://opportunity-finder.americanhealthequity.org',
  'https://funding-narrative.americanhealthequity.org',
  'https://www.americanhealthequity.org'
]);

const APPROVED_RETURN_PATHS = new Set(['/tools']);

export function validateReturnTo(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!APPROVED_RETURN_ORIGINS.has(parsed.origin)) return null;

    if (parsed.origin === 'https://www.americanhealthequity.org' && !APPROVED_RETURN_PATHS.has(parsed.pathname)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}
