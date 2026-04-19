import axios from 'axios';
import type { ImmowebListing } from '@/types/scan';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '';

function extractListingId(url: string): string {
  const match = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  if (!match) throw new Error('Kon geen geldig Immoweb-advertentie-ID vinden in de URL. Controleer de link.');
  return match[1];
}

function getMeta(html: string, attr: string, val: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']+)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${val}["']`, 'i'));
  if (!m) return null;
  return m[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function unescapeJson(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Extract the full listing description from the embedded JS/JSON blob in the HTML.
// Immoweb embeds listing data as a JSON object in a <script> tag.
function extractFullDescription(html: string): string | null {
  const searchable = html.replace(/\\\//g, '/');

  // Pattern 1: localized object — "description":{"nl":"..."}
  const nlMatch = searchable.match(/"description"\s*:\s*\{\s*"nl"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (nlMatch && nlMatch[1].length > 80) return unescapeJson(nlMatch[1]);

  // Pattern 2: localized object — try fr or en if nl is null/empty
  const langMatch = searchable.match(/"description"\s*:\s*\{[^}]{0,40}"(?:fr|en)"\s*:\s*"((?:[^"\\]|\\.){80,})"/);
  if (langMatch) return unescapeJson(langMatch[1]);

  // Pattern 3: plain string value (must be substantially longer than a meta description)
  const simpleMatch = searchable.match(/"description"\s*:\s*"((?:[^"\\]|\\.){200,})"/);
  if (simpleMatch) return unescapeJson(simpleMatch[1]);

  return null;
}

// Extract Belgian phone number from arbitrary text
function extractPhone(text: string): string | null {
  const m = text.match(/\b(0[1-9]\d{7,8}|\+32\s?\d[\d\s.]{7,11})\b/);
  return m ? m[1].replace(/\s/g, '') : null;
}

// Extract email address from arbitrary text (skips common image/asset extensions)
function extractEmailAddress(text: string): string | null {
  const m = text.match(/\b([a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})\b/);
  if (!m) return null;
  const addr = m[1];
  // Ignore addresses that look like assets or tracking pixels
  if (/\.(png|jpg|gif|svg|webp|css|js)$/i.test(addr)) return null;
  return addr;
}

function extractPhotos(html: string): string[] {
  // Unescape \/ (JSON-encoded slashes in JS source) before searching
  const searchable = html.replace(/\\\//g, '/');
  const pattern = /https:\/\/(?:media-resize\.immowebstatic\.be|picture\.immoweb\.be)\/classifieds\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  const found = searchable.match(pattern) ?? [];

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
  if (byHash.size > 0) return Array.from(byHash.values());

  const ogImage = getMeta(html, 'property', 'og:image');
  return ogImage ? [ogImage] : [];
}

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

function parseHtmlFallback(html: string, url: string, id: string): ImmowebListing {
  const title = getMeta(html, 'property', 'og:title') ?? '';

  // Try to extract full description from embedded JS/JSON blob first
  const fullDescription = extractFullDescription(html);
  const description = fullDescription
    ?? getMeta(html, 'property', 'og:description')
    ?? getMeta(html, 'name', 'description')
    ?? '';

  console.info(`[scraper] Description: ${fullDescription ? `JS blob (${description.length} chars)` : `meta tag (${description.length} chars)`}`);

  // Extract contact info from description text first, then broader HTML search
  const agencyPhone = extractPhone(description) ?? extractPhone(html.slice(0, 150_000));
  const agencyEmail = extractEmailAddress(description) ?? extractEmailAddress(html.slice(0, 150_000));
  console.info(`[scraper] Contact — phone: ${agencyPhone ?? 'not found'}, email: ${agencyEmail ?? 'not found'}`);

  const cityMatch = title.match(/\bin\s+([^-\d€]+?)\s*(?:\s-|€|\d)/i);
  const priceMatch = title.match(/€[^\d]*([\d.,]+)/);
  const bedroomMatch = title.match(/(\d+)\s*slaapkamer/i)
    ?? description.match(/(\d+)\s*slaapkamer/i);
  const areaMatch = title.match(/(\d+)\s*m[²2]/i)
    ?? description.match(/(\d+)\s*m[²2]/i);
  const postalMatch = description.match(/\b(\d{4})\b/)
    ?? title.match(/\b(\d{4})\b/);

  const epcLabelMatch =
    html.match(/["'](?:epcScore|energyClass|epcLabel)["']\s*:\s*["']([A-G][+]{0,2})["']/i)
    ?? html.match(/\bEPC[:\s\-–]*([A-G][+]{0,2})\b/i);

  const photos = extractPhotos(html);
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
    agencyPhone,
    agencyEmail,
    stats: { daysOnline: null, views: null, saves: null },
    compliance: {
      hasRenovationObligation: /renovatieplicht|renovatieverplichting/.test(dl),
      hasAsbestosInfo: /asbest|asbestattest|amiante/.test(dl),
      hasEpcLabel: !!epcLabelMatch || /\bepc\b/.test(dl),
      hasFloodRisk: /overstromingsgevoeligheid|watertoets|p-score|g-score/.test(dl),
    },
  };
}

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }

  const id = extractListingId(url);

  if (!SCRAPER_KEY) throw new Error('SCRAPER_API_KEY is niet geconfigureerd in de omgevingsvariabelen.');

  const res = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: SCRAPER_KEY, url: url.split('?')[0], render: 'false' },
    timeout: 90_000,
    responseType: 'arraybuffer',
  });

  const html = Buffer.from(res.data as ArrayBuffer).toString('utf8');
  if (html.length < 1000) throw new Error(`Pagina kon niet worden opgehaald (${html.length} bytes).`);

  console.info(`[scraper] HTML fetched: ${html.length} bytes, ${extractPhotos(html).length} photos found`);
  return parseHtmlFallback(html, url, id);
}
