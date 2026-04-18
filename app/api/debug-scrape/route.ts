import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  const cleanUrl = url.split('?')[0];

  const res = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: SCRAPER_KEY, url: cleanUrl, country_code: 'be', render: 'false' },
    timeout: 90_000,
    responseType: 'text',
  });

  const html = String(res.data ?? '');

  // Extract meta tags
  const getMeta = (attr: string, val: string) => {
    const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']+)["']`, 'i'))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${val}["']`, 'i'));
    return m?.[1] ?? null;
  };

  // Extract JSON-LD blocks
  const jsonLdMatches = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const jsonLd = jsonLdMatches.map(m => { try { return JSON.parse(m[1]); } catch { return m[1].slice(0, 200); } });

  // Extract dataLayer pushes
  const dataLayerMatches = Array.from(html.matchAll(/dataLayer\.push\((\{[\s\S]*?\})\)/g)).slice(0, 5);
  const dataLayers = dataLayerMatches.map(m => { try { return JSON.parse(m[1]); } catch { return m[1].slice(0, 200); } });

  return NextResponse.json({
    bytes: html.length,
    meta: {
      title: getMeta('property', 'og:title') ?? getMeta('name', 'title'),
      description: getMeta('property', 'og:description') ?? getMeta('name', 'description'),
      image: getMeta('property', 'og:image'),
      price: getMeta('property', 'og:price:amount') ?? getMeta('property', 'product:price:amount'),
    },
    jsonLd,
    dataLayers,
    first300: html.slice(0, 300),
  });
}
