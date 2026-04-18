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

function parsePrice(text: string): number | null {
  const m = text.match(/[\d.,]{4,}/);
  if (!m) return null;
  return parseFloat(m[0].replace(/\./g, '').replace(',', '.')) || null;
}

function extractFromHtml(html: string, url: string, id: string): ImmowebListing {
  const title = getMeta(html, 'property', 'og:title') ?? '';
  const description = getMeta(html, 'property', 'og:description') ?? getMeta(html, 'name', 'description') ?? '';
  const image = getMeta(html, 'property', 'og:image');

  // Parse structured info from title: "Huis te koop in Tielt-Winge - € 519.000 - 3 slaapkamers - 250m² - Immoweb"
  const parts = title.split(' - ');
  const propertyType = parts[0]?.split(' ')[0]?.toUpperCase() ?? 'UNKNOWN';

  const cityMatch = title.match(/\bin\s+([^-\d]+?)\s*(?:-|€|\d)/i);
  const city = cityMatch?.[1]?.trim() ?? '';

  const priceMatch = title.match(/€[^\d]*([\d.,]+)/);
  const price = priceMatch ? parsePrice(priceMatch[1]) : null;

  const bedroomMatch = title.match(/(\d+)\s*slaapkamer/i);
  const bedrooms = bedroomMatch ? parseInt(bedroomMatch[1]) : null;

  const areaMatch = title.match(/(\d+)\s*m²/i);
  const area = areaMatch ? parseInt(areaMatch[1]) : null;

  // Postal code from description: "3390 – Tielt-Winge"
  const postalMatch = description.match(/\b(\d{4})\b/);
  const postalCode = postalMatch?.[1] ?? '';

  const photos: string[] = image ? [image] : [];
  const dl = description.toLowerCase();

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
    epcLabel: null,
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
      hasEpcLabel: /epc|energielabel/.test(dl),
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

  // Use arraybuffer to ensure UTF-8 decoding (prevents mojibake with text responseType)
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
