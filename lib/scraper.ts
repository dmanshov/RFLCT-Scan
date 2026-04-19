import axios from 'axios';
import type { ImmowebListing } from '@/types/scan';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

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

function extractPhotos(html: string): string[] {
  // Collect all Immoweb CDN image URLs embedded anywhere in the HTML (including unexecuted JS)
  const pattern = /https:\/\/(?:media-resize\.immowebstatic\.be|picture\.immoweb\.be)\/classifieds\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  const found = html.match(pattern) ?? [];
  // Deduplicate and prefer largest size variant (736x736 over thumbnails)
  const byHash = new Map<string, string>();
  for (const url of found) {
    const hashMatch = url.match(/\/([a-f0-9]{32})\./);
    if (!hashMatch) continue;
    const hash = hashMatch[1];
    const existing = byHash.get(hash);
    // Prefer higher resolution: 736 > 500 > 300 > smaller
    if (!existing || url.includes('736') || (!existing.includes('736') && url.includes('500'))) {
      byHash.set(hash, url);
    }
  }
  return Array.from(byHash.values());
}

function extractFromHtml(html: string, url: string, id: string): ImmowebListing {
  const title = getMeta(html, 'property', 'og:title') ?? '';
  const description = getMeta(html, 'property', 'og:description') ?? getMeta(html, 'name', 'description') ?? '';

  // Parse structured info from title: "Huis te koop in Tielt-Winge - € 519.000 - 3 slaapkamers - 250m² - Immoweb"
  const propertyType = title.split(' ')[0]?.toUpperCase() ?? 'UNKNOWN';

  const cityMatch = title.match(/\bin\s+([^-\d€]+?)\s*(?:\s-|€|\d)/i);
  const city = cityMatch?.[1]?.trim() ?? '';

  const priceMatch = title.match(/€[^\d]*([\d.,]+)/);
  const price = priceMatch
    ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || null
    : null;

  const bedroomMatch = title.match(/(\d+)\s*slaapkamer/i);
  const bedrooms = bedroomMatch ? parseInt(bedroomMatch[1]) : null;

  const areaMatch = title.match(/(\d+)\s*m[²2]/i);
  const area = areaMatch ? parseInt(areaMatch[1]) : null;

  const postalMatch = description.match(/\b(\d{4})\b/);
  const postalCode = postalMatch?.[1] ?? '';

  // EPC: search HTML for label in various formats (meta tags, JSON properties, text)
  const epcLabelMatch =
    html.match(/["'](?:epcScore|energyClass|epcClass|epcLabel|label)["']\s*:\s*["']([A-G][+]{0,2})["']/i)
    ?? html.match(/\bEPC[:\s\-–]*([A-G][+]{0,2})\b/i)
    ?? html.match(/energielabel[:\s]*([A-G][+]{0,2})\b/i);
  const epcLabel = epcLabelMatch?.[1]?.toUpperCase() ?? null;

  const photos = extractPhotos(html);

  const dl = (title + ' ' + description + ' ' + html.slice(0, 50_000)).toLowerCase();

  return {
    id,
    url,
    title,
    description,
    price,
    propertyType,
    city,
    postalCode,
    photos,
    floorPlans: [],
    epcScore: null,
    epcLabel,
    area,
    bedrooms,
    bathrooms: null,
    constructionYear: null,
    agencyName: null,
    agencyPhone: null,
    agencyEmail: null,
    stats: { daysOnline: null, views: null, saves: null },
    compliance: {
      hasRenovationObligation: /renovatieplicht|renovatieverplichting|r[eé]novation obligatoire/.test(dl),
      hasAsbestosInfo: /asbest|asbestattest|amiante/.test(dl),
      hasEpcLabel: !!epcLabel || /\bepc\b/.test(dl),
      hasFloodRisk: /overstromingsgevoeligheid|watertoets|risque d.inondation|p-score|g-score/.test(dl),
    },
  };
}

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }

  const id = extractListingId(url);
  const cleanUrl = url.split('?')[0];

  const res = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: SCRAPER_KEY, url: cleanUrl, render: 'false' },
    timeout: 90_000,
    responseType: 'arraybuffer',
  });

  const html = Buffer.from(res.data as ArrayBuffer).toString('utf8');

  if (html.length < 1000) {
    throw new Error(`Pagina kon niet worden opgehaald (${html.length} bytes). Controleer de ScraperAPI-credits.`);
  }

  return extractFromHtml(html, url, id);
}
