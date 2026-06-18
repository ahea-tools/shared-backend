import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getTool } from '@/lib/config/tools';
import { buildESearchUrl, buildEFetchUrl, parseESearchIds, parseEFetchArticles } from '@/lib/pubmed';

const { runGenerationMock, checkRateLimitMock, getBackendSessionDetailsMock, maybeSingleMock, updateEqMock, logGenerationEventMock, retrievePubMedArticlesMock } = vi.hoisted(() => ({
  runGenerationMock: vi.fn(), checkRateLimitMock: vi.fn(), getBackendSessionDetailsMock: vi.fn(), maybeSingleMock: vi.fn(), updateEqMock: vi.fn(), logGenerationEventMock: vi.fn(), retrievePubMedArticlesMock: vi.fn()
}));
vi.mock('@/lib/openai/generate', () => ({ runGeneration: runGenerationMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSessionDetails: getBackendSessionDetailsMock }));
vi.mock('@/lib/usage/events', () => ({ logGenerationEvent: logGenerationEventMock }));
vi.mock('@/lib/pubmed', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/pubmed')>()), retrievePubMedArticles: retrievePubMedArticlesMock }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }), update: () => ({ eq: updateEqMock }) }) }) }));
import { POST } from '@/app/api/generate/route';

const articles = [1,2,3].map((n) => ({ pmid: `${100+n}`, title: `Title ${n}`, journal: `Journal ${n}`, year: '2024', abstract: 'This is a usable public health implementation abstract with enough detail for synthesis and equity considerations in practice settings.', pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${100+n}/` }));
const output = { evidenceSnapshot: 'snapshot', keyTakeaways: ['one'], whatAppearsMostEffective: ['two'], contextAndApplicability: ['three'], equityConsiderations: ['four'], practiceConsiderations: ['five'], evidenceGapsAndUnansweredQuestions: ['six'], sourcesReviewed: articles.map(({title,year,journal,pmid,pubmedUrl}) => ({title,year,journal,pmid,pubmedUrl})) };
const makeReq = (body: unknown) => new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
beforeEach(() => { vi.clearAllMocks(); getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null }); maybeSingleMock.mockResolvedValue({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 0 } }); checkRateLimitMock.mockResolvedValue({ limited: false }); retrievePubMedArticlesMock.mockResolvedValue({ candidateCount: 3, usableCount: 3, selected: articles }); runGenerationMock.mockResolvedValue({ outputText: JSON.stringify(output) }); updateEqMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: null }) }); logGenerationEventMock.mockResolvedValue(undefined); });

describe('evidence-in-practice registry and PubMed utilities', () => {
  it('accepts evidence-in-practice and keeps existing tools', () => { expect(getTool('evidence-in-practice')?.toolId).toBe('evidence-in-practice'); expect(getTool('strategic-messaging')).toBeTruthy(); expect(getTool('career-positioning')).toBeTruthy(); expect(getTool('opportunity-finder')).toBeTruthy(); expect(getTool('funding-narrative')).toBeTruthy(); expect(getTool('unknown')).toBeUndefined(); });
  it('builds E-Utilities URLs and parses responses without live NCBI', () => { process.env.NCBI_TOOL = 'ahea-test'; process.env.NCBI_EMAIL = 'test@example.com'; process.env.NCBI_API_KEY = 'k'; const url = buildESearchUrl({ topic: 'diabetes', population: 'rural', setting: 'clinic' }); expect(url.searchParams.get('db')).toBe('pubmed'); expect(url.searchParams.get('tool')).toBe('ahea-test'); expect(url.searchParams.get('email')).toBe('test@example.com'); expect(url.searchParams.get('api_key')).toBe('k'); expect(parseESearchIds({ esearchresult: { idlist: ['1','1','abc','2'] } })).toEqual(['1','2']); expect(buildEFetchUrl(['1','2']).searchParams.get('id')).toBe('1,2'); const parsed = parseEFetchArticles('<PubmedArticle><PMID>1</PMID><ArticleTitle>T</ArticleTitle><Journal><Title>J</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal><Abstract><AbstractText>This abstract has enough words and characters to be considered usable for this parser and test case in public health.</AbstractText></Abstract></PubmedArticle>'); expect(parsed[0]).toMatchObject({ pmid: '1', title: 'T', journal: 'J', year: '2024', pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/' }); });
});

describe('evidence-in-practice generate route', () => {
  it('blocks unauthenticated before PubMed/OpenAI', async () => { getBackendSessionDetailsMock.mockResolvedValueOnce({ session: null, failureReason: 'missing' }); maybeSingleMock.mockResolvedValueOnce({ data: null }); const res = await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } })); expect(res.status).toBe(403); expect(retrievePubMedArticlesMock).not.toHaveBeenCalled(); expect(runGenerationMock).not.toHaveBeenCalled(); });
  it('blocks unverified, free-limit, and rate-limited before PubMed/OpenAI', async () => { maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: false, access_status: 'free', access_expires_at: null, generations_used: 0 } }); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(403); maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 2 } }); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(403); checkRateLimitMock.mockResolvedValueOnce({ limited: true }); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(403); expect(retrievePubMedArticlesMock).not.toHaveBeenCalled(); expect(runGenerationMock).not.toHaveBeenCalled(); expect(updateEqMock).not.toHaveBeenCalled(); });

  it('uses free-trial path for expired paid access with remaining generations and blocks exhausted expired access before providers', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'paid', access_expires_at: '2000-01-01T00:00:00Z', generations_used: 1 } });
    const allowedRes = await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }));
    const allowedBody = await allowedRes.json();
    expect(allowedRes.status).toBe(200);
    expect(allowedBody.usage.accessStatus).toBe('free');
    expect(allowedBody.usage.generationsUsed).toBe(2);
    expect(retrievePubMedArticlesMock).toHaveBeenCalledTimes(1);
    expect(runGenerationMock).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
    maybeSingleMock.mockResolvedValue({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'paid', access_expires_at: '2000-01-01T00:00:00Z', generations_used: 2 } });
    checkRateLimitMock.mockResolvedValue({ limited: false });
    retrievePubMedArticlesMock.mockResolvedValue({ candidateCount: 3, usableCount: 3, selected: articles });
    runGenerationMock.mockResolvedValue({ outputText: JSON.stringify(output) });
    const blockedRes = await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }));
    const blockedBody = await blockedRes.json();
    expect(blockedRes.status).toBe(403);
    expect(blockedBody.usage.accessStatus).toBe('free');
    expect(retrievePubMedArticlesMock).not.toHaveBeenCalled();
    expect(runGenerationMock).not.toHaveBeenCalled();
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it('returns output only and increments usage after valid output and source integrity', async () => { const res = await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'diabetes', population: 'rural', setting: 'clinic' } })); const body = await res.json(); expect(res.status).toBe(200); expect(body.output.evidenceSnapshot).toBe('snapshot'); expect(body.data).toBeUndefined(); expect(body.result).toBeUndefined(); expect(body.generation).toBeUndefined(); expect(body.content).toBeUndefined(); expect(updateEqMock).toHaveBeenCalledWith('id', 'u1'); });
  it('insufficient evidence skips OpenAI and usage increment', async () => { retrievePubMedArticlesMock.mockResolvedValueOnce({ candidateCount: 1, usableCount: 1, selected: [articles[0]] }); const res = await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'narrow' } })); const body = await res.json(); expect(res.status).toBe(200); expect(body.status).toBe('insufficient_evidence'); expect(runGenerationMock).not.toHaveBeenCalled(); expect(updateEqMock).not.toHaveBeenCalled(); });

  it('rejects mismatched source title, journal, year, and URL without incrementing usage', async () => {
    for (const badSource of [
      { ...output.sourcesReviewed[0], title: 'Invented title' },
      { ...output.sourcesReviewed[0], journal: 'Invented journal' },
      { ...output.sourcesReviewed[0], year: '1999' },
      { ...output.sourcesReviewed[0], pubmedUrl: 'https://example.com/101/' }
    ]) {
      vi.clearAllMocks();
      getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
      maybeSingleMock.mockResolvedValue({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 0 } });
      checkRateLimitMock.mockResolvedValue({ limited: false });
      retrievePubMedArticlesMock.mockResolvedValue({ candidateCount: 3, usableCount: 3, selected: articles });
      runGenerationMock.mockResolvedValue({ outputText: JSON.stringify({ ...output, sourcesReviewed: [badSource] }) });
      updateEqMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: null }) });
      const res = await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }));
      expect(res.status).toBe(502);
      expect(updateEqMock).not.toHaveBeenCalled();
    }
  });
  it('malformed JSON, schema failures, source mismatches, pubmed/openai errors do not increment', async () => { runGenerationMock.mockResolvedValueOnce({ outputText: '{bad' }); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(502); runGenerationMock.mockResolvedValueOnce({ outputText: JSON.stringify({ evidenceSnapshot: 'x' }) }); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(502); runGenerationMock.mockResolvedValueOnce({ outputText: JSON.stringify({ ...output, sourcesReviewed: [{ ...output.sourcesReviewed[0], pmid: '999' }] }) }); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(502); retrievePubMedArticlesMock.mockRejectedValueOnce(new Error('down')); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(502); retrievePubMedArticlesMock.mockResolvedValueOnce({ candidateCount: 3, usableCount: 3, selected: articles }); runGenerationMock.mockRejectedValueOnce(new Error('openai down')); expect((await POST(makeReq({ toolId: 'evidence-in-practice', input: { topic: 'x' } }))).status).toBe(500); expect(updateEqMock).not.toHaveBeenCalled(); });
});
