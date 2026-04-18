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
  return m ? decodeURIComponent(m[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))) : null;
}

function extractFromHtml(html: string, url: string, id: string): ImmowebListing {
  const title = getMeta(html, 'property', 'og:title') ?? getMeta(html, 'name', 'title') ?? '';
  const description = getMeta(html, 'property', 'og:description') ?? getMeta(html, 'name', 'description') ?? '';
  const image = getMeta(html, 'property', 'og:image');

  // Price from og tags or title pattern like "€ 349.000"
  const priceMatch = (title + ' ' + description).match(/[€$]\s*([\d.,]+)/);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) : null;

  // Try JSON-LD for richer data
  let jsonLd: Record<string, unknown> = {};
  const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) { try { jsonLd = JSON.parse(ldMatch[1]); } catch { /* ignore */ } }

  const photos: string[] = image ? [image] : [];

  const dl = description.toLowerCase();
  return {
    id,
    url,
    title,
    description,
    price: (jsonLd?.offers as Record<string, unknown>)?.price as number ?? price,
    propertyType: 'UNKNOWN',
    city: (jsonLd?.address as Record<string, unknown>)?.addressLocality as string ?? '',
    postalCode: (jsonLd?.address as Record<string, unknown>)?.postalCode as string ?? '',
    photos,
    floorPlans: [],
    epcScore: null,
    epcLabel: null,
    area: null,
    bedrooms: null,
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

  const res = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: SCRAPER_KEY, url: cleanUrl, country_code: 'be', render: 'false' },
    timeout: 90_000,
    responseType: 'text',
  });

  const html = String(res.data ?? '');
  if (html.length < 1000) {
    throw new Error(`Pagina kon niet worden opgehaald (${html.length} bytes). Controleer de ScraperAPI-credits.`);
  }

  return extractFromHtml(html, url, id);
}
