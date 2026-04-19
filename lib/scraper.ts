import axios from 'axios';
import type { ImmowebListing } from '@/types/scan';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

function extractListingId(url: string): string {
  const match = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  if (!match) throw new Error('Kon geen geldig Immoweb-advertentie-ID vinden in de URL. Controleer de link.');
  return match[1];
}

// ── Strategy 1: Direct Immoweb JSON API (works in local dev, often blocked on Vercel) ──

async function tryDirectApi(id: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await axios.get(`https://api.immoweb.be/classified/${id}`, {
      params: { language: 'nl', country: 'BE' },
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'nl-BE,nl;q=0.9',
        Referer: 'https://www.immoweb.be/',
      },
      timeout: 10_000,
      responseType: 'text',
    });
    const text = String(res.data ?? '').trim();
    if (!text.startsWith('{')) return null;
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (obj?.id || obj?.property) { console.info('[scraper] Direct API ✓'); return obj; }
  } catch (e) {
    console.warn('[scraper] Direct API:', e instanceof Error ? e.message : e);
  }
  return null;
}

// ── Strategy 2: Immoweb JSON API via ScraperAPI ───────────────────────────────

async function tryScraperApiJson(id: string): Promise<Record<string, unknown> | null> {
  const apiUrl = `https://api.immoweb.be/classified/${id}?language=nl&country=BE`;
  try {
    const res = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: SCRAPER_KEY, url: apiUrl },
      headers: { Accept: 'application/json' },
      timeout: 60_000,
      responseType: 'text',
    });
    const text = String(res.data ?? '').trim();
    if (!text.startsWith('{')) { console.warn('[scraper] ScraperAPI JSON: unexpected:', text.slice(0, 200)); return null; }
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (obj?.id || obj?.property) { console.info('[scraper] ScraperAPI JSON ✓'); return obj; }
  } catch (e) {
    console.warn('[scraper] ScraperAPI JSON:', e instanceof Error ? e.message : e);
  }
  return null;
}

// ── Strategy 2: HTML meta tags (limited fallback) ────────────────────────────

function getMeta(html: string, attr: string, val: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']+)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${val}["']`, 'i'));
  if (!m) return null;
  return m[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractPhotosFromHtml(html: string): string[] {
  const pattern = /https:\/\/(?:media-resize\.immowebstatic\.be|picture\.immoweb\.be)\/classifieds\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  const found = html.match(pattern) ?? [];
  const byHash = new Map<string, string>();
  for (const url of found) {
    const hashMatch = url.match(/\/([a-f0-9]{32})\./);
    if (!hashMatch) continue;
    const hash = hashMatch[1];
    const existing = byHash.get(hash);
    if (!existing || url.includes('736') || (!existing.includes('736') && url.includes('500'))) {
      byHash.set(hash, url);
    }
  }
  const ogImage = getMeta(html, 'property', 'og:image');
  if (ogImage && byHash.size === 0) return [ogImage];
  return Array.from(byHash.values());
}

function parseHtmlFallback(html: string, url: string, id: string): ImmowebListing {
  const title = getMeta(html, 'property', 'og:title') ?? '';
  const description = getMeta(html, 'property', 'og:description') ?? getMeta(html, 'name', 'description') ?? '';

  const cityMatch = title.match(/\bin\s+([^-\d€]+?)\s*(?:\s-|€|\d)/i);
  const priceMatch = title.match(/€[^\d]*([\d.,]+)/);
  const bedroomMatch = title.match(/(\d+)\s*slaapkamer/i);
  const areaMatch = title.match(/(\d+)\s*m[²2]/i);
  const postalMatch = description.match(/\b(\d{4})\b/);

  const epcLabelMatch =
    html.match(/["'](?:epcScore|energyClass|epcClass|epcLabel)["']\s*:\s*["']([A-G][+]{0,2})["']/i)
    ?? html.match(/\bEPC[:\s\-–]*([A-G][+]{0,2})\b/i);

  const photos = extractPhotosFromHtml(html);
  const dl = (description + ' ' + html.slice(0, 50_000)).toLowerCase();

  return {
    id,
    url,
    title,
    description,
    price: priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || null : null,
    propertyType: title.split(' ')[0]?.toUpperCase() ?? 'UNKNOWN',
    city: cityMatch?.[1]?.trim() ?? '',
    postalCode: postalMatch?.[1] ?? '',
    photos,
    floorPlans: [],
    epcScore: null,
    epcLabel: epcLabelMatch?.[1]?.toUpperCase() ?? null,
    area: areaMatch ? parseInt(areaMatch[1]) : null,
    bedrooms: bedroomMatch ? parseInt(bedroomMatch[1]) : null,
    bathrooms: null,
    constructionYear: null,
    agencyName: null,
    agencyPhone: null,
    agencyEmail: null,
    stats: { daysOnline: null, views: null, saves: null },
    compliance: {
      hasRenovationObligation: /renovatieplicht|renovatieverplichting/.test(dl),
      hasAsbestosInfo: /asbest|asbestattest|amiante/.test(dl),
      hasEpcLabel: !!epcLabelMatch || /\bepc\b/.test(dl),
      hasFloodRisk: /overstromingsgevoeligheid|watertoets|p-score|g-score/.test(dl),
    },
  };
}

// ── Parse full JSON API response ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonApi(raw: any, url: string, id: string): ImmowebListing {
  const property = raw?.property ?? {};
  const transaction = raw?.transaction ?? {};
  const energy = property?.energy ?? raw?.energy ?? {};
  const location = property?.location ?? raw?.location ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstCustomer: any = (raw?.customers ?? [])[0] ?? {};

  const descObj = raw?.description ?? {};
  const description: string =
    typeof descObj === 'string' ? descObj : descObj?.nl ?? descObj?.fr ?? descObj?.en ?? '';

  const title: string = raw?.cluster?.title ?? raw?.propertyName ?? raw?.title ?? '';

  const photos: string[] = [];
  const floorPlans: string[] = [];
  for (const pic of (raw?.media?.pictures ?? []) as unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pic as any;
    const picUrl: string = p.largeUrl ?? p.url ?? p.mediumUrl ?? '';
    if (!picUrl) continue;
    (p.type === 'FLOOR_PLAN' || p.category === 'FLOOR_PLAN' ? floorPlans : photos).push(picUrl);
  }

  const epcScore: number | null = energy.primaryEnergyConsumptionPerSqm ?? energy.primaryEnergyConsumption ?? null;
  const epcLabel: string | null = energy.epcScore ?? energy.energyClass ?? null;

  let daysOnline: number | null = null;
  const pubStr: string | null = raw?.publication?.publicationDate ?? raw?.publicationDate ?? null;
  if (pubStr) daysOnline = Math.floor((Date.now() - new Date(pubStr).getTime()) / 86_400_000);

  const dl = description.toLowerCase();
  return {
    id: String(raw?.id ?? id),
    url,
    title,
    description,
    price: transaction?.sale?.price ?? raw?.price?.mainValue ?? null,
    propertyType: property?.type ?? raw?.type ?? 'UNKNOWN',
    city: location?.locality ?? location?.municipality ?? '',
    postalCode: String(location?.postalCode ?? ''),
    photos,
    floorPlans,
    epcScore,
    epcLabel,
    area: property?.netHabitableSurface ?? property?.livingArea ?? null,
    bedrooms: property?.bedroomCount ?? null,
    bathrooms: property?.bathroomCount ?? null,
    constructionYear: property?.building?.constructionYear ?? null,
    agencyName: firstCustomer?.name ?? null,
    agencyPhone: firstCustomer?.phone ?? null,
    agencyEmail: firstCustomer?.email ?? null,
    stats: { daysOnline, views: null, saves: null },
    compliance: {
      hasRenovationObligation: /renovatieplicht|renovatieverplichting|r[eé]novation obligatoire/.test(dl),
      hasAsbestosInfo: /asbest|asbestattest|amiante/.test(dl),
      hasEpcLabel: !!epcLabel,
      hasFloodRisk: /overstromingsgevoeligheid|watertoets|risque d.inondation|p-score|g-score/.test(dl),
    },
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }

  const id = extractListingId(url);

  // Strategy 1: Direct API (free, works outside Vercel datacenter)
  const direct = await tryDirectApi(id);
  if (direct) return parseJsonApi(direct, url, id);

  // Strategy 2: JSON API via ScraperAPI (residential proxy)
  const scraperJson = await tryScraperApiJson(id);
  if (scraperJson) return parseJsonApi(scraperJson, url, id);

  // Strategy 3: HTML page via ScraperAPI (limited data — meta tags only)
  console.warn('[scraper] Falling back to HTML meta tags');
  try {
    const res = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: SCRAPER_KEY, url: url.split('?')[0], render: 'false' },
      timeout: 90_000,
      responseType: 'arraybuffer',
    });
    const html = Buffer.from(res.data as ArrayBuffer).toString('utf8');
    if (html.length < 1000) throw new Error(`Pagina te klein (${html.length} bytes)`);
    return parseHtmlFallback(html, url, id);
  } catch (e) {
    throw new Error(
      `Kon de advertentie niet ophalen. Controleer de ScraperAPI-sleutel en credits. (${e instanceof Error ? e.message : e})`
    );
  }
}
