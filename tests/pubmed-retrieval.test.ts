import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boundSearchConcepts, buildPubMedQuery, EVIDENCE_SYNTHESIS_SOURCE_LIMIT, PUBMED_PRIMARY_CANDIDATE_LIMIT, retrievePubMedArticles, screenEvidenceCandidates, type PubMedArticle } from '@/lib/pubmed';

const input = { topic: 'diabetes prevention', population: 'rural adults', setting: 'primary care' };
const article = (pmid: string): PubMedArticle => ({ pmid, title: `Title ${pmid}`, journal: 'Journal', year: '2025', abstract: `Abstract ${pmid} has enough relevant detail to pass the usable abstract parsing threshold for this controlled unit test.`, pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` });
const xml = (ids: string[]) => ids.map((id) => `<PubmedArticle><PMID>${id}</PMID><ArticleTitle>Title ${id}</ArticleTitle><Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue></Journal><Abstract><AbstractText>Abstract ${id} has enough relevant detail to pass the usable abstract parsing threshold for this controlled unit test.</AbstractText></Abstract></PubmedArticle>`).join('');
const response = (body: unknown, kind: 'json'|'text' = 'json') => ({ ok: true, json: vi.fn().mockResolvedValue(body), text: vi.fn().mockResolvedValue(kind === 'text' ? body : JSON.stringify(body)) }) as any;
const concepts = { coreConcepts: [{ concept: 'diabetes', synonyms: ['diabetes mellitus'] }], optionalNarrowingConcepts: [{ concept: 'rural adults', synonyms: ['rural population'] }] };

beforeEach(() => { process.env.NCBI_TOOL = 'ahea-test'; process.env.NCBI_EMAIL = 'test@example.com'; delete process.env.NCBI_API_KEY; });

describe('bounded PubMed retrieval flow', () => {
  it('bounds interpreted concepts and backend-generates sanitized Boolean syntax without the universal clause', () => {
    const bounded = boundSearchConcepts({ coreConcepts: Array.from({ length: 6 }, (_, i) => ({ concept: `term ${i} [Title]`, synonyms: ['one', 'two', 'three', 'four'] })), optionalNarrowingConcepts: Array.from({ length: 4 }, (_, i) => ({ concept: `optional ${i}`, synonyms: [] })) });
    expect(bounded.coreConcepts).toHaveLength(4); expect(bounded.coreConcepts[0].synonyms).toHaveLength(3); expect(bounded.optionalNarrowingConcepts).toHaveLength(2);
    const query = buildPubMedQuery(bounded, { includeOptional: true });
    expect(query).toContain(' OR '); expect(query).toContain(' AND '); expect(query).not.toContain('[Title]'); expect(query).not.toContain('public health OR health equity');
  });

  it('screens all candidates in one batch and cannot select an unknown PMID', async () => {
    const call = vi.fn().mockResolvedValue({ decisions: [{ pmid: '1', include: true, reason: 'Relevant' }, { pmid: '999', include: true, reason: 'Unknown' }, { pmid: '2', include: false, reason: 'Not relevant' }] });
    const selected = await screenEvidenceCandidates(input, [article('1'), article('2')], call);
    expect(call).toHaveBeenCalledOnce(); expect(selected.map(({ pmid }) => pmid)).toEqual(['1']);
    expect(JSON.parse(call.mock.calls[0][0].input).articles).toHaveLength(2);
  });

  it('uses one core-only fallback, preserves core concepts, deduplicates PMIDs, and excludes irrelevant articles', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ esearchresult: { idlist: ['1', '2'] } }))
      .mockResolvedValueOnce(response(xml(['1', '2']), 'text'))
      .mockResolvedValueOnce(response({ esearchresult: { idlist: ['1', '3', '4'] } }))
      .mockResolvedValueOnce(response(xml(['1', '3', '4']), 'text'));
    const call = vi.fn()
      .mockResolvedValueOnce(concepts)
      .mockResolvedValueOnce({ decisions: [{ pmid: '1', include: true, reason: 'Relevant' }, { pmid: '2', include: false, reason: 'Irrelevant' }] })
      .mockResolvedValueOnce({ decisions: [{ pmid: '3', include: true, reason: 'Relevant' }, { pmid: '4', include: true, reason: 'Relevant' }] });
    const result = await retrievePubMedArticles(input, fetchMock, call);
    expect(fetchMock).toHaveBeenCalledTimes(4); expect(call).toHaveBeenCalledTimes(3); expect(result.fallbackUsed).toBe(true);
    const primaryUrl = fetchMock.mock.calls[0][0] as URL; const fallbackUrl = fetchMock.mock.calls[2][0] as URL;
    expect(primaryUrl.searchParams.get('term')).toContain('rural adults'); expect(fallbackUrl.searchParams.get('term')).toContain('diabetes'); expect(fallbackUrl.searchParams.get('term')).not.toContain('rural adults');
    expect(result.selected.map(({ pmid }) => pmid)).toEqual(['1', '3', '4']); expect(JSON.parse(call.mock.calls[2][0].input).articles.map((a: any) => a.pmid)).toEqual(['3', '4']);
  });

  it('does not fallback when primary and core-only queries are identical', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ esearchresult: { idlist: ['1'] } })).mockResolvedValueOnce(response(xml(['1']), 'text'));
    const call = vi.fn().mockResolvedValueOnce({ ...concepts, optionalNarrowingConcepts: [] }).mockResolvedValueOnce({ decisions: [{ pmid: '1', include: false, reason: 'Irrelevant' }] });
    const result = await retrievePubMedArticles(input, fetchMock, call);
    expect(result.fallbackUsed).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(2); expect(call).toHaveBeenCalledTimes(2);
  });

  it('keeps named candidate and synthesis limits', () => { expect(PUBMED_PRIMARY_CANDIDATE_LIMIT).toBe(30); expect(EVIDENCE_SYNTHESIS_SOURCE_LIMIT).toBe(8); });
});
