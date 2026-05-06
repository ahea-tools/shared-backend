import { getEnv } from '@/lib/config/env';

export type SquarespaceProductVariant = {
  id?: string;
  name?: string;
  sku?: string;
  price?: { value?: number; currency?: string };
  optionValues?: Array<{ name?: string; value?: string }>;
};

export type SquarespaceProduct = {
  id: string;
  name?: string;
  title?: string;
  type?: string;
  variants?: SquarespaceProductVariant[];
};

export async function listAllSquarespaceProducts(): Promise<SquarespaceProduct[]> {
  const { SQUARESPACE_API_KEY } = getEnv();
  const all: SquarespaceProduct[] = [];
  let cursor: string | undefined;

  while (true) {
    const url = new URL('https://api.squarespace.com/v2/commerce/products');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${SQUARESPACE_API_KEY}`,
        'User-Agent': 'ahea-shared-backend/1.0',
        Accept: 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Squarespace products request failed: ${res.status}`);
    const data = await res.json() as { result?: SquarespaceProduct[]; pagination?: { nextPageCursor?: string | null } };
    all.push(...(data.result ?? []));
    cursor = data.pagination?.nextPageCursor ?? undefined;
    if (!cursor) break;
  }

  return all;
}
