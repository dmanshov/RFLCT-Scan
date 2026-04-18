import axios from 'axios';
import type { ImmowebListing } from '@/types/scan';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

function extractListingId(url: string): string {
  const match = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  if (!match) throw new Error('Kon geen geldig Immoweb-advertentie-ID vinden in de URL. Controleer de link.');
  return match[1];
}

function extractNextData(html: string): Record<string, unknown> | null {
  // Regex is more reliable than a DOM parser for large SSR pages
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    console.warn('[scraper] __NEXT_DATA__ not found. Page snippet:', html.slice(0, 500));
    return null;
  }
  try {
    const nd = JSON.parse(match[1]);
    const props = nd?.props?.pageProps ?? {};
    const listing = props?.classified ?? props?.listing ?? props?.classifiedProperty ?? null;
    return listing && typeof listing === 'object' ? listing : null;
  } catch (e) {
    console.warn('[scraper] Failed to parse __NEXT_DATA__:', e);
    return null;
  }
}

async function fetchListing(id: string, originalUrl: string): Promise<Record<string, unknown>> {
  const cleanUrl = originalUrl.split('?')[0];

  const res = await axios.get('https://api.scraperapi.com/', {
    params: {
      api_key: SCRAPER_KEY,
      url: cleanUrl,
      country_code: 'be',
      render: 'false',
    },
    timeout: 90_000,
    responseType: 'text',
  });

  const html = String(res.data ?? '');
  const listing = extractNextData(html);
  if (listing) return listing;

  throw new Error(`Kon geen advertentiedata vinden op de pagina (${html.length} bytes ontvangen). Controleer de URL.`);
}

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

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }
  const id = extractListingId(url);
  const raw = await fetchListing(id, url);
  return parseListingData(raw, url, id);
}
