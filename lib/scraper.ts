import axios from 'axios';
import { load } from 'cheerio';
import type { ImmowebListing } from '@/types/scan';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*;q=0.8',
  'Accept-Language': 'nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.immoweb.be/',
  'Origin': 'https://www.immoweb.be',
};

function extractListingId(url: string): string {
  // Immoweb IDs are 7-9 digit numbers at the end of the path
  const match = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  if (!match) throw new Error('Kon geen geldig Immoweb-advertentie-ID vinden in de URL. Controleer de link.');
  return match[1];
}

// ── Fetch strategies ─────────────────────────────────────────────────────────

async function fetchViaImmowebApi(id: string): Promise<unknown> {
  const res = await axios.get(`https://api.immoweb.be/classified/${id}`, {
    params: { language: 'nl', country: 'BE' },
    headers: { ...BROWSER_HEADERS, Accept: 'application/json' },
    timeout: 20_000,
  });
  return res.data;
}

async function fetchViaHtml(url: string): Promise<unknown> {
  const res = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 25_000, maxRedirects: 5 });
  const $ = load(res.data as string);
  const raw = $('script#__NEXT_DATA__').html() ?? '';
  if (!raw) throw new Error('Geen __NEXT_DATA__ gevonden op de pagina.');
  const nextData = JSON.parse(raw);
  const props = nextData?.props?.pageProps ?? {};
  return props?.classified ?? props?.listing ?? props?.classifiedProperty ?? null;
}

async function fetchViaScraperApi(id: string, originalUrl: string): Promise<unknown> {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return null; // not configured — skip

  // Try the Immoweb internal API through ScraperAPI
  const targetUrl = `https://api.immoweb.be/classified/${id}?language=nl&country=BE`;
  const res = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: key, url: targetUrl },
    headers: { Accept: 'application/json' },
    timeout: 60_000,
  });
  if (res.data && typeof res.data === 'object') return res.data;

  // Fall back to HTML through ScraperAPI
  const htmlRes = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: key, url: originalUrl, render: 'false' },
    timeout: 60_000,
  });
  const $ = load(htmlRes.data as string);
  const raw = $('script#__NEXT_DATA__').html() ?? '';
  if (!raw) throw new Error('ScraperAPI: geen data gevonden op de pagina.');
  const nextData = JSON.parse(raw);
  const props = nextData?.props?.pageProps ?? {};
  return props?.classified ?? props?.listing ?? props?.classifiedProperty ?? null;
}

// ── Parse the raw API/page response ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListingData(raw: any, url: string, id: string): ImmowebListing {
  const property = raw?.property ?? {};
  const transaction = raw?.transaction ?? {};
  const energy = property?.energy ?? raw?.energy ?? {};
  const location = property?.location ?? raw?.location ?? {};
  const customers: unknown[] = raw?.customers ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstCustomer: any = customers[0] ?? {};

  // Description
  const descObj = raw?.description ?? {};
  const description: string =
    typeof descObj === 'string' ? descObj : descObj?.nl ?? descObj?.fr ?? descObj?.en ?? '';

  // Title
  const title: string = raw?.cluster?.title ?? raw?.propertyName ?? raw?.title ?? '';

  // Photos & floor plans
  const photos: string[] = [];
  const floorPlans: string[] = [];
  const pictures: unknown[] = raw?.media?.pictures ?? [];
  for (const pic of pictures) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pic as any;
    const picUrl: string = p.largeUrl ?? p.url ?? p.mediumUrl ?? '';
    if (!picUrl) continue;
    if (p.type === 'FLOOR_PLAN' || p.category === 'FLOOR_PLAN') {
      floorPlans.push(picUrl);
    } else {
      photos.push(picUrl);
    }
  }

  // EPC
  const epcScore: number | null = energy.primaryEnergyConsumptionPerSqm ?? energy.primaryEnergyConsumption ?? null;
  const epcLabel: string | null = energy.epcScore ?? energy.energyClass ?? null;

  // Days online
  let daysOnline: number | null = null;
  const pubDateStr: string | null = raw?.publication?.publicationDate ?? raw?.publicationDate ?? null;
  if (pubDateStr) {
    daysOnline = Math.floor((Date.now() - new Date(pubDateStr).getTime()) / 86_400_000);
  }

  // Compliance
  const descLower = description.toLowerCase();
  const compliance = {
    hasRenovationObligation: /renovatieplicht|renovatieverplichting|r[eé]novation obligatoire/.test(descLower),
    hasAsbestosInfo: /asbest|asbestattest|amiante/.test(descLower),
    hasEpcLabel: !!epcLabel,
    hasFloodRisk: /overstromingsgevoeligheid|watertoets|risque d'inondation|p-score|g-score/.test(descLower),
  };

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
    compliance,
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }

  const id = extractListingId(url);
  let lastError: Error = new Error('Onbekende fout');

  // 1. Immoweb internal REST API (no HTML parsing needed)
  try {
    const data = await fetchViaImmowebApi(id);
    if (data && typeof data === 'object') return parseListingData(data, url, id);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn('Immoweb API failed:', lastError.message);
  }

  // 2. HTML page with __NEXT_DATA__ extraction
  try {
    const data = await fetchViaHtml(url);
    if (data && typeof data === 'object') return parseListingData(data, url, id);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn('HTML scrape failed:', lastError.message);
  }

  // 3. ScraperAPI proxy (if SCRAPER_API_KEY is set)
  try {
    const data = await fetchViaScraperApi(id, url);
    if (data && typeof data === 'object') return parseListingData(data, url, id);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn('ScraperAPI failed:', lastError.message);
  }

  // All strategies failed
  const hasScraperKey = !!process.env.SCRAPER_API_KEY;
  throw new Error(
    hasScraperKey
      ? `Kon de advertentie niet ophalen via meerdere methoden. Laatste fout: ${lastError.message}`
      : `Immoweb blokkeert automatische toegang vanaf servers. Voeg een gratis SCRAPER_API_KEY toe via www.scraperapi.com (1000 gratis verzoeken/maand) als omgevingsvariabele in Vercel.`,
  );
}
