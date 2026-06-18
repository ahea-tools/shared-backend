export type PubMedArticle = { pmid: string; title: string; journal: string; year: string; abstract: string; pubmedUrl: string };

type PubMedEnv = { tool: string; email: string; apiKey?: string };
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const usable = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

function getPubMedEnv(): PubMedEnv {
  const tool = process.env.NCBI_TOOL;
  const email = process.env.NCBI_EMAIL;
  if (!tool || !email) throw new Error('NCBI E-Utilities environment is not configured.');
  return { tool, email, apiKey: process.env.NCBI_API_KEY || undefined };
}

function addCommonParams(params: URLSearchParams, env: PubMedEnv) {
  params.set('tool', env.tool);
  params.set('email', env.email);
  if (env.apiKey) params.set('api_key', env.apiKey);
}

export function buildPubMedQuery(input: { topic: string; population?: string; setting?: string }) {
  const parts = [input.topic, input.population, input.setting].filter(usable).map((p) => `(${String(p).trim()})`);
  return `${parts.join(' AND ')} AND (public health OR health equity OR implementation OR program OR policy OR practice OR health services)`;
}

export function buildESearchUrl(input: { topic: string; population?: string; setting?: string }, retmax = 20) {
  const env = getPubMedEnv();
  const url = new URL('esearch.fcgi', BASE);
  const params = new URLSearchParams();
  params.set('db', 'pubmed');
  params.set('term', buildPubMedQuery(input));
  params.set('retmode', 'json');
  params.set('retmax', String(retmax));
  addCommonParams(params, env);
  url.search = params.toString();
  return url;
}

export function parseESearchIds(payload: unknown): string[] {
  const ids = (payload as any)?.esearchresult?.idlist;
  return Array.isArray(ids) ? [...new Set(ids.filter((id) => /^\d+$/.test(String(id))).map(String))] : [];
}

export function buildEFetchUrl(pmids: string[]) {
  const env = getPubMedEnv();
  const url = new URL('efetch.fcgi', BASE);
  const params = new URLSearchParams();
  params.set('db', 'pubmed');
  params.set('id', pmids.join(','));
  params.set('retmode', 'xml');
  addCommonParams(params, env);
  url.search = params.toString();
  return url;
}

const textOf = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';
};
const decodeXml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function parseEFetchArticles(xml: string): PubMedArticle[] {
  const records = xml.match(/<PubmedArticle[\s\S]*?<\/PubmedArticle>/gi) ?? [];
  const seen = new Set<string>();
  const articles: PubMedArticle[] = [];
  for (const record of records) {
    const pmid = textOf(record, 'PMID');
    if (!/^\d+$/.test(pmid) || seen.has(pmid)) continue;
    const title = textOf(record, 'ArticleTitle');
    const journal = textOf(record, 'Title') || textOf(record, 'ISOAbbreviation');
    const year = textOf(record, 'Year') || textOf(record, 'MedlineDate').slice(0, 4);
    const abstractParts = [...record.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi)].map((m) => decodeXml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).filter(Boolean);
    const abstract = abstractParts.join(' ');
    if (!title || !journal || !year || abstract.length < 80) continue;
    seen.add(pmid);
    articles.push({ pmid, title, journal, year, abstract, pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` });
  }
  return articles;
}

export async function retrievePubMedArticles(input: { topic: string; population?: string; setting?: string }, fetchImpl: typeof fetch = fetch) {
  const searchRes = await fetchImpl(buildESearchUrl(input));
  if (!searchRes.ok) throw new Error('PubMed ESearch failed.');
  const ids = parseESearchIds(await searchRes.json());
  if (ids.length === 0) return { candidateCount: 0, usableCount: 0, selected: [] as PubMedArticle[] };
  const fetchRes = await fetchImpl(buildEFetchUrl(ids));
  if (!fetchRes.ok) throw new Error('PubMed EFetch failed.');
  const articles = parseEFetchArticles(await fetchRes.text());
  return { candidateCount: ids.length, usableCount: articles.length, selected: articles.slice(0, 8) };
}
