import { z } from 'zod';
import { openaiClient } from '@/lib/openai/client';

export type PubMedArticle = { pmid: string; title: string; journal: string; year: string; abstract: string; pubmedUrl: string };
export type EvidenceInput = { topic: string; population?: string; setting?: string };
export type SearchConcept = { concept: string; synonyms: string[] };
export type SearchConcepts = { coreConcepts: SearchConcept[]; optionalNarrowingConcepts: SearchConcept[] };

export const PUBMED_PRIMARY_CANDIDATE_LIMIT = 30;
export const EVIDENCE_SYNTHESIS_SOURCE_LIMIT = 8;
const EVIDENCE_MIN_RELEVANT_ARTICLES = 3;
const MAX_CORE_CONCEPTS = 4;
const MAX_OPTIONAL_CONCEPTS = 2;
const MAX_SYNONYMS = 3;
const INTERNAL_MODEL = 'gpt-4.1-mini';

type PubMedEnv = { tool: string; email: string; apiKey?: string };
type InternalStructuredCall = (args: { name: string; schema: Record<string, unknown>; system: string; input: string }) => Promise<unknown>;
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';

const conceptItemSchema = z.object({ concept: z.string().trim().min(1).max(120), synonyms: z.array(z.string().trim().min(1).max(120)) }).strict();
const interpretationSchema = z.object({ coreConcepts: z.array(conceptItemSchema).min(1), optionalNarrowingConcepts: z.array(conceptItemSchema) }).strict();
const screeningSchema = z.object({ decisions: z.array(z.object({ pmid: z.string().regex(/^\d+$/), include: z.boolean(), reason: z.string().trim().max(160) }).strict()) }).strict();

const interpretationJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    coreConcepts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { concept: { type: 'string' }, synonyms: { type: 'array', items: { type: 'string' } } }, required: ['concept', 'synonyms'] } },
    optionalNarrowingConcepts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { concept: { type: 'string' }, synonyms: { type: 'array', items: { type: 'string' } } }, required: ['concept', 'synonyms'] } }
  }, required: ['coreConcepts', 'optionalNarrowingConcepts']
};
const screeningJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: { decisions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { pmid: { type: 'string' }, include: { type: 'boolean' }, reason: { type: 'string' } }, required: ['pmid', 'include', 'reason'] } } },
  required: ['decisions']
};

export class EvidenceRetrievalError extends Error {
  constructor(public readonly failureStep: 'search_interpretation_failed' | 'pubmed_retrieval_failed' | 'relevance_screening_failed') {
    super('Evidence retrieval failed.');
    this.name = 'EvidenceRetrievalError';
  }
}

function getPubMedEnv(): PubMedEnv {
  const tool = process.env.NCBI_TOOL;
  const email = process.env.NCBI_EMAIL;
  if (!tool || !email) throw new Error('NCBI E-Utilities environment is not configured.');
  return { tool, email, apiKey: process.env.NCBI_API_KEY || undefined };
}

function addCommonParams(params: URLSearchParams, env: PubMedEnv) {
  params.set('tool', env.tool); params.set('email', env.email);
  if (env.apiKey) params.set('api_key', env.apiKey);
}

const sanitizeTerm = (value: string) => value.normalize('NFKC').replace(/["'`(){}\[\]<>:*\\]/g, ' ').replace(/\b(?:AND|OR|NOT)\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
const normalizeConcepts = (items: SearchConcept[], limit: number) => items.slice(0, limit).map(({ concept, synonyms }) => {
  const cleanConcept = sanitizeTerm(concept);
  const cleanSynonyms = [...new Set(synonyms.map(sanitizeTerm).filter((term) => term && term.toLowerCase() !== cleanConcept.toLowerCase()))].slice(0, MAX_SYNONYMS);
  return { concept: cleanConcept, synonyms: cleanSynonyms };
}).filter(({ concept }) => concept.length > 0);

export function boundSearchConcepts(value: unknown): SearchConcepts {
  const parsed = interpretationSchema.safeParse(value);
  if (!parsed.success) throw new EvidenceRetrievalError('search_interpretation_failed');
  const result = {
    coreConcepts: normalizeConcepts(parsed.data.coreConcepts, MAX_CORE_CONCEPTS),
    optionalNarrowingConcepts: normalizeConcepts(parsed.data.optionalNarrowingConcepts, MAX_OPTIONAL_CONCEPTS)
  };
  if (result.coreConcepts.length === 0) throw new EvidenceRetrievalError('search_interpretation_failed');
  return result;
}

export function buildPubMedQuery(concepts: SearchConcepts, options: { includeOptional: boolean }) {
  const groups = [...concepts.coreConcepts, ...(options.includeOptional ? concepts.optionalNarrowingConcepts : [])];
  return groups.map(({ concept, synonyms }) => `(${[concept, ...synonyms].map((term) => `"${sanitizeTerm(term)}"`).filter((term) => term !== '""').join(' OR ')})`).join(' AND ');
}

export function buildESearchUrl(query: string, retmax = PUBMED_PRIMARY_CANDIDATE_LIMIT) {
  const env = getPubMedEnv(); const url = new URL('esearch.fcgi', BASE); const params = new URLSearchParams();
  params.set('db', 'pubmed'); params.set('term', query); params.set('retmode', 'json'); params.set('retmax', String(retmax)); params.set('sort', 'relevance'); addCommonParams(params, env); url.search = params.toString(); return url;
}

export function parseESearchIds(payload: unknown): string[] {
  const ids = (payload as any)?.esearchresult?.idlist;
  return Array.isArray(ids) ? [...new Set(ids.filter((id) => /^\d+$/.test(String(id))).map(String))] : [];
}

export function buildEFetchUrl(pmids: string[]) {
  const env = getPubMedEnv(); const url = new URL('efetch.fcgi', BASE); const params = new URLSearchParams();
  params.set('db', 'pubmed'); params.set('id', pmids.join(',')); params.set('retmode', 'xml'); addCommonParams(params, env); url.search = params.toString(); return url;
}

const decodeXml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const textOf = (xml: string, tag: string) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? decodeXml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : ''; };

export function parseEFetchArticles(xml: string): PubMedArticle[] {
  const records = xml.match(/<PubmedArticle[\s\S]*?<\/PubmedArticle>/gi) ?? []; const seen = new Set<string>(); const articles: PubMedArticle[] = [];
  for (const record of records) {
    const pmid = textOf(record, 'PMID'); if (!/^\d+$/.test(pmid) || seen.has(pmid)) continue;
    const title = textOf(record, 'ArticleTitle'); const journal = textOf(record, 'Title') || textOf(record, 'ISOAbbreviation'); const year = textOf(record, 'Year') || textOf(record, 'MedlineDate').slice(0, 4);
    const abstract = [...record.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi)].map((m) => decodeXml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).filter(Boolean).join(' ');
    if (!title || !journal || !year || abstract.length < 80) continue;
    seen.add(pmid); articles.push({ pmid, title, journal, year, abstract, pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` });
  }
  return articles;
}

const defaultStructuredCall: InternalStructuredCall = async ({ name, schema, system, input }) => {
  const response = await openaiClient.responses.create({ model: INTERNAL_MODEL, temperature: 0, max_output_tokens: 1200, input: [{ role: 'system', content: system }, { role: 'user', content: input }], text: { format: { type: 'json_schema', name, schema, strict: true } } });
  const responseAny = response as any;
  const parsed = responseAny?.output?.flatMap((item: any) => item?.content ?? []).find((item: any) => item?.parsed != null)?.parsed;
  const raw = parsed ?? responseAny?.output_text ?? responseAny?.outputText;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Missing structured output.');
  return JSON.parse(raw);
};

export async function interpretEvidenceSearchInput(input: EvidenceInput, call: InternalStructuredCall = defaultStructuredCall) {
  try {
    const value = await call({ name: 'evidence_search_concepts', schema: interpretationJsonSchema, system: 'Extract a small set of PubMed-friendly concepts. Preserve every central concept. Put specificity that can safely be dropped in optionalNarrowingConcepts. Supply only genuine synonyms. Return concepts only, never Boolean syntax, tags, filters, or PubMed query strings.', input: JSON.stringify(input) });
    return boundSearchConcepts(value);
  } catch (error) { if (error instanceof EvidenceRetrievalError) throw error; throw new EvidenceRetrievalError('search_interpretation_failed'); }
}

async function retrieveCandidates(query: string, fetchImpl: typeof fetch) {
  const searchRes = await fetchImpl(buildESearchUrl(query)); if (!searchRes.ok) throw new EvidenceRetrievalError('pubmed_retrieval_failed');
  const ids = parseESearchIds(await searchRes.json()); if (ids.length === 0) return { candidateCount: 0, articles: [] as PubMedArticle[] };
  const fetchRes = await fetchImpl(buildEFetchUrl(ids)); if (!fetchRes.ok) throw new EvidenceRetrievalError('pubmed_retrieval_failed');
  return { candidateCount: ids.length, articles: parseEFetchArticles(await fetchRes.text()) };
}

export async function screenEvidenceCandidates(input: EvidenceInput, articles: PubMedArticle[], call: InternalStructuredCall = defaultStructuredCall) {
  if (articles.length === 0) return [];
  try {
    const value = await call({ name: 'evidence_relevance_screen', schema: screeningJsonSchema, system: 'For each supplied PubMed article, decide whether its title and abstract materially help answer the original topic, population, and setting. Keep reasons brief. Never invent or alter PMIDs.', input: JSON.stringify({ request: input, articles: articles.map(({ pmid, title, abstract }) => ({ pmid, title, abstract })) }) });
    const parsed = screeningSchema.safeParse(value); if (!parsed.success) throw new Error('Invalid screening output.');
    const allowed = new Set(articles.map(({ pmid }) => pmid));
    const included = new Set(parsed.data.decisions.filter(({ pmid, include }) => include && allowed.has(pmid)).map(({ pmid }) => pmid));
    return articles.filter(({ pmid }) => included.has(pmid));
  } catch { throw new EvidenceRetrievalError('relevance_screening_failed'); }
}

export async function retrievePubMedArticles(input: EvidenceInput, fetchImpl: typeof fetch = fetch, call: InternalStructuredCall = defaultStructuredCall) {
  const concepts = await interpretEvidenceSearchInput(input, call);
  const primaryQuery = buildPubMedQuery(concepts, { includeOptional: true }); const coreQuery = buildPubMedQuery(concepts, { includeOptional: false });
  const primary = await retrieveCandidates(primaryQuery, fetchImpl); const primaryRelevant = await screenEvidenceCandidates(input, primary.articles, call);
  let fallbackUsed = false; let fallbackCandidateCount = 0; let fallbackRelevant: PubMedArticle[] = [];
  if (primaryRelevant.length < EVIDENCE_MIN_RELEVANT_ARTICLES && coreQuery !== primaryQuery) {
    fallbackUsed = true; const fallback = await retrieveCandidates(coreQuery, fetchImpl); fallbackCandidateCount = fallback.candidateCount;
    const primaryPmids = new Set(primary.articles.map(({ pmid }) => pmid)); const newFallbackArticles = fallback.articles.filter(({ pmid }) => !primaryPmids.has(pmid));
    fallbackRelevant = await screenEvidenceCandidates(input, newFallbackArticles, call);
  }
  const relevant = [...new Map([...primaryRelevant, ...fallbackRelevant].map((article) => [article.pmid, article])).values()];
  return { candidateCount: primary.candidateCount, usableCount: relevant.length, selected: relevant.slice(0, EVIDENCE_SYNTHESIS_SOURCE_LIMIT), primaryCandidateCount: primary.candidateCount, primaryRelevantCount: primaryRelevant.length, fallbackUsed, fallbackCandidateCount, fallbackRelevantCount: fallbackRelevant.length, finalSelectedSourceCount: Math.min(relevant.length, EVIDENCE_SYNTHESIS_SOURCE_LIMIT) };
}
