import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  try {
    const res = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: SCRAPER_KEY, url: url.split('?')[0], render: 'false' },
      timeout: 90_000,
      responseType: 'text',
    });

    const html = String(res.data ?? '');

    const getMeta = (attr: string, val: string) => {
      const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${val}["'][^>]+content=["']([^"']+)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${val}["']`, 'i'));
      return m?.[1] ?? null;
    };

    const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    let jsonLd = null;
    if (ldMatch) { try { jsonLd = JSON.parse(ldMatch[1]); } catch { jsonLd = 'parse error'; } }

    return NextResponse.json({
      bytes: html.length,
      title: getMeta('property', 'og:title'),
      description: getMeta('property', 'og:description'),
      image: getMeta('property', 'og:image'),
      jsonLd,
      first300: html.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
