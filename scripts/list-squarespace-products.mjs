import process from 'node:process';

const apiKey = process.env.SQUARESPACE_API_KEY;
if (!apiKey) throw new Error('SQUARESPACE_API_KEY is required');

async function listAllSquarespaceProducts() {
  const all = [];
  let cursor;
  while (true) {
    const url = new URL('https://api.squarespace.com/v2/commerce/products');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Squarespace products request failed: ${res.status}`);
    const data = await res.json();
    all.push(...(data.result ?? []));
    cursor = data.pagination?.nextPageCursor;
    if (!cursor) break;
  }
  return all;
}

const products = await listAllSquarespaceProducts();
const monthly = [];
const annual = [];
for (const product of products) {
  const pName = product.name ?? product.title ?? 'untitled';
  const type = product.type ?? 'unknown';
  const variants = product.variants ?? [];
  if (variants.length === 0) {
    console.log(`product=${product.id} name=${pName} type=${type} variant=none sku=none price=none`);
    continue;
  }
  for (const variant of variants) {
    const optionLabel = (variant.optionValues ?? []).map((x) => `${x.name ?? 'option'}:${x.value ?? ''}`).join('|') || (variant.name ?? 'unnamed-variant');
    const price = variant.price?.value ? `${variant.price.value} ${variant.price.currency ?? ''}`.trim() : 'none';
    console.log(`product=${product.id} name=${pName} type=${type} variant=${variant.id ?? 'none'} variantLabel=${optionLabel} sku=${variant.sku ?? 'none'} price=${price}`);
    const text = `${pName} ${optionLabel}`.toLowerCase();
    const targetId = (variant.id ?? product.id).toLowerCase();
    if (text.includes('month')) monthly.push(targetId);
    if (text.includes('annual') || text.includes('year')) annual.push(targetId);
  }
}
console.log('\nSuggested env values (prefer variant IDs when present):');
console.log(`SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS=${[...new Set(monthly)].join(',')}`);
console.log(`SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS=${[...new Set(annual)].join(',')}`);
