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

/**
 * Extract photos in their correct display order by reading the largeUrl fields
 * from the embedded JSON blob. Falls back to regex if the JSON approach yields nothing.
 * Also detects floor plans by checking for "FLOOR_PLAN" in the surrounding context.
 */
function extractPhotosOrdered(html: string): { photos: string[]; floorPlans: string[] } {
  const searchable = html.replace(/\\\//g, '/');

  const photos: string[] = [];
  const floorPlans: string[] = [];
  const seen = new Set<string>();

  const IMMOWEB_URL_RE = /https:\/\/(?:media-resize\.immowebstatic\.be|picture\.immoweb\.be)\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  const FLOOR_PLAN_RE  = /FLOOR_PLAN|floor[_\-]?plan|grondplan/i;

  // Pass 1: largeUrl fields — classify by ±600 char context
  const largeUrlRe = /"largeUrl"\s*:\s*"(https:\/\/(?:media-resize\.immowebstatic\.be|picture\.immoweb\.be)[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = largeUrlRe.exec(searchable)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const ctx = searchable.slice(Math.max(0, m.index - 600), m.index + 600);
    (FLOOR_PLAN_RE.test(ctx) ? floorPlans : photos).push(url);
  }

  // Pass 2: look for "FLOOR_PLAN" as a quoted JSON value only — avoids matching
  // "grondplan" in Dutch prose text which would cause false positives
  const fpValueRe = /"(?:FLOOR_PLAN|floor[_\-]?plan)"/gi;
  let fp: RegExpExecArray | null;
  while ((fp = fpValueRe.exec(searchable)) !== null) {
    const ctx = searchable.slice(Math.max(0, fp.index - 800), fp.index + 800);
    for (const u of ctx.match(IMMOWEB_URL_RE) ?? []) {
      if (!seen.has(u)) {
        seen.add(u);
        floorPlans.push(u);
      }
    }
  }

  if (photos.length > 0 || floorPlans.length > 0) {
    console.info(`[scraper] Photos from JSON blob: ${photos.length} photos, ${floorPlans.length} floor plans`);
    return { photos, floorPlans };
  }

  // Fallback: regex extraction (order may differ from actual listing)
  const fallback = extractPhotos(html);
  console.info(`[scraper] Photos from regex fallback: ${fallback.length}`);
  return { photos: fallback, floorPlans: [] };
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
    const typeStr = String(p.type ?? p.category ?? p.mediaType ?? p.subType ?? p.pictureType ?? '');
    (/FLOOR_PLAN|floor[_\-]?plan|grondplan/i.test(typeStr) ? floorPlans : photos).push(picUrl);
  }

  const epcScore: number | null = energy.primaryEnergyConsumptionPerSqm ?? energy.primaryEnergyConsumption ?? null;
  const epcLabel: string | null = energy.epcScore ?? energy.energyClass ?? null;
  let daysOnline: number | null = null;
  const pubStr: string | null = raw?.publication?.publicationDate ?? raw?.publicationDate ?? null;
  if (pubStr) daysOnline = Math.floor((Date.now() - new Date(pubStr).getTime()) / 86_400_000);

  const streetName: string = location?.street?.name ?? location?.streetName ?? '';
  const streetNum: string = String(location?.street?.number ?? location?.houseNumber ?? '');
  const street: string | null = streetName ? `${streetName}${streetNum ? ` ${streetNum}` : ''}` : null;

  const dl = description.toLowerCase();
  // Flood risk is stored in structured property fields, not just description text
  const flooding = property?.flooding ?? raw?.flooding ?? {};
  const hasFloodRiskStructured =
    flooding?.floodZoneType     !== undefined ||
    flooding?.floodingNorm      !== undefined ||
    flooding?.partialFloodingInsuranceRequired !== undefined ||
    property?.floodZoneType     !== undefined;
  // Count how many of P-score / G-score are null ("niet gespecificeerd")
  const pNull = hasFloodRiskStructured && (flooding?.floodZoneTypeCurrentRisk  === null || flooding?.floodZoneType === null);
  const gNull = hasFloodRiskStructured && (flooding?.floodZoneTypePotentialRisk === null || flooding?.floodZoneType === null);
  const floodUnspecifiedCountApi = (pNull ? 1 : 0) + (gNull ? 1 : 0);
  return {
    id: String(raw?.id ?? id),
    url,
    title,
    description,
    price: transaction?.sale?.price ?? raw?.price?.mainValue ?? null,
    propertyType: property?.type ?? raw?.type ?? 'UNKNOWN',
    street,
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
      hasFloodRisk: hasFloodRiskStructured || /overstromingsgevoeligheid|watertoets|risque d.inondation|p-score|g-score/.test(dl),
      floodUnspecifiedCount: floodUnspecifiedCountApi,
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

  // Extract street from embedded JSON blob — try nested object, flat field, and plain string
  const searchable = html.replace(/\\\//g, '/');
  const streetNameNested = searchable.match(/"street"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/)?.[1];
  const streetNameFlat   = searchable.match(/"streetName"\s*:\s*"([^"\\]+)"/)?.[1];
  const streetNamePlain  = searchable.match(/"street"\s*:\s*"([^"\\]+)"/)?.[1];
  const extractedStreetName = streetNameNested ?? streetNameFlat ?? streetNamePlain ?? null;

  const streetNumNested = searchable.match(/"street"\s*:\s*\{[^}]*"number"\s*:\s*"([^"\\]+)"/)?.[1];
  const streetNumFlat   = searchable.match(/"houseNumber"\s*:\s*"([^"\\]+)"/)?.[1];
  const extractedStreetNum = streetNumNested ?? streetNumFlat ?? null;

  const htmlStreet: string | null = extractedStreetName
    ? `${extractedStreetName}${extractedStreetNum ? ` ${extractedStreetNum}` : ''}`
    : null;
  console.info(`[scraper] Street: ${htmlStreet ?? 'not found'}`);

  // Extract construction year from embedded JSON blob
  const yearMatch = searchable.match(/"constructionYear"\s*:\s*(\d{4})/);
  const constructionYear = yearMatch ? parseInt(yearMatch[1]) : null;

  const epcLabelMatch =
    html.match(/["'](?:epcScore|energyClass|epcLabel)["']\s*:\s*["']([A-G][+]{0,2})["']/i)
    ?? html.match(/\bEPC[:\s\-–]*([A-G][+]{0,2})\b/i);

  const epcScoreMatch =
    searchable.match(/"primaryEnergyConsumptionPerSqm"\s*:\s*(\d+)/)
    ?? searchable.match(/"primaryEnergyConsumption"\s*:\s*(\d+)/);
  const epcScore = epcScoreMatch ? parseInt(epcScoreMatch[1]) : null;

  const { photos, floorPlans } = extractPhotosOrdered(html);
  const dl = (description + ' ' + html.slice(0, 50_000)).toLowerCase();

  return {
    id,
    url,
    title,
    description,
    price: priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || null : null,
    propertyType: title.split(' ')[0]?.toUpperCase() ?? 'UNKNOWN',
    street: htmlStreet,
    city: cityMatch?.[1]?.trim() ?? '',
    postalCode: postalMatch?.[1] ?? '',
    photos,
    floorPlans,
    epcScore,
    epcLabel: epcLabelMatch?.[1]?.toUpperCase() ?? null,
    area: areaMatch ? parseInt(areaMatch[1]) : null,
    bedrooms: bedroomMatch ? parseInt(bedroomMatch[1]) : null,
    bathrooms: null,
    constructionYear,
    agencyName: null,
    agencyPhone,
    agencyEmail,
    stats: { daysOnline: null, views: null, saves: null },
    compliance: {
      hasRenovationObligation: /renovatieplicht|renovatieverplichting/.test(dl),
      hasAsbestosInfo: /asbest|asbestattest|amiante/.test(dl),
      hasEpcLabel: !!epcLabelMatch || /\bepc\b/.test(dl),
      // Check JSON blob fields first (floodZoneType etc.), then fall back to text keywords
      hasFloodRisk: /"floodZoneType"\s*:/.test(searchable)
        || /"floodingNorm"\s*:/.test(searchable)
        || /"partialFloodingInsuranceRequired"\s*:/.test(searchable)
        || /overstromingsgevoeligheid|watertoets|p-score|g-score/.test(dl),
      // Count P-score and G-score "niet gespecificeerd" individually
      floodUnspecifiedCount: (
        (/"floodZoneTypeCurrentRisk"\s*:\s*null/.test(searchable) || /p-score[^.\n]{0,80}niet\s+gespecificeerd/i.test(html) || /niet\s+gespecificeerd[^.\n]{0,80}p-score/i.test(html)) ? 1 : 0
      ) + (
        (/"floodZoneTypePotentialRisk"\s*:\s*null/.test(searchable) || /g-score[^.\n]{0,80}niet\s+gespecificeerd/i.test(html) || /niet\s+gespecificeerd[^.\n]{0,80}g-score/i.test(html)) ? 1 : 0
      ),
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
