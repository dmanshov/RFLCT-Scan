import axios from 'axios';
import { load } from 'cheerio';
import type { ImmowebListing } from '@/types/scan';

// Default key — override via SCRAPER_API_KEY env var in Vercel
const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.immoweb.be/',
  'Origin': 'https://www.immoweb.be',
};

function extractListingId(url: string): string {
  const match = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  if (!match) throw new Error('Kon geen geldig Immoweb-advertentie-ID vinden in de URL. Controleer de link.');
  return match[1];
}

/** Try to return a usable object from any response body (string or already parsed). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceJson(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return null;
}

/** Extract __NEXT_DATA__ listing object from HTML string. */
function extractNextData(html: string): Record<string, unknown> | null {
  const $ = load(html);
  const raw = $('script#__NEXT_DATA__').html() ?? '';
  if (!raw) return null;
  try {
    const nd = JSON.parse(raw);
    const props = nd?.props?.pageProps ?? {};
    const listing = props?.classified ?? props?.listing ?? props?.classifiedProperty ?? null;
    return listing && typeof listing === 'object' ? listing : null;
  } catch { return null; }
}

// ── Strategy 1: Immoweb internal REST API ────────────────────────────────────

async function tryImmowebApi(id: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await axios.get(`https://api.immoweb.be/classified/${id}`, {
      params: { language: 'nl', country: 'BE' },
      headers: { ...BROWSER_HEADERS, Accept: 'application/json' },
      timeout: 12_000,
      responseType: 'text',
    });
    const obj = coerceJson(res.data);
    if (obj?.id || obj?.property) return obj;
  } catch (e) {
    console.warn('[scraper] Immoweb API:', e instanceof Error ? e.message : e);
  }
  return null;
}

// ── Strategy 2: ScraperAPI residential proxy ─────────────────────────────────
// One call only (HTML page). No country_code = global proxy pool = much faster.
// SSE streaming keeps the Vercel function alive, so 90s timeout is safe.

async function tryScraperApi(id: string, originalUrl: string): Promise<Record<string, unknown> | null> {
  // Strip tracking params — cleaner URL, less chance of redirect loops
  const cleanUrl = originalUrl.split('?')[0];

  const res = await axios.get('https://api.scraperapi.com/', {
    params: {
      api_key: SCRAPER_KEY,
      url: cleanUrl,
      render: 'false',       // no JS rendering needed — Immoweb is SSR
    },
    timeout: 90_000,
    responseType: 'text',
  });

  const html = String(res.data ?? '');

  // Primary: __NEXT_DATA__ from the HTML page
  const obj = extractNextData(html);
  if (obj) {
    console.info('[scraper] ScraperAPI → HTML ✓');
    return obj;
  }

  // Fallback: maybe the response itself is JSON (redirected to API)
  const json = coerceJson(html);
  if (json && (json.id || json.property)) return json;

  throw new Error(`ScraperAPI leverde geen herkenbare Immoweb-data (${html.length} bytes ontvangen).`);
}

// ── Parse unified listing object ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListingData(raw: any, url: string, id: string): ImmowebListing {
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

// ── Public entry point ───────────────────────────────────────────────────────

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }

  const id = extractListingId(url);
  const errors: string[] = [];

  // Strategy 1: Immoweb internal API — fast, no proxy cost
  const direct = await tryImmowebApi(id);
  if (direct) return parseListingData(direct, url, id);
  errors.push('Immoweb API: geblokkeerd');

  // Strategy 2: ScraperAPI residential proxy
  try {
    const scraped = await tryScraperApi(id, url);
    if (scraped) return parseListingData(scraped, url, id);
    errors.push('ScraperAPI: geen data');
  } catch (e) {
    errors.push(`ScraperAPI: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`Kon de advertentie niet ophalen. Fouten: ${errors.join(' | ')}`);
}
