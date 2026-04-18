import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const strategy = req.nextUrl.searchParams.get('strategy') ?? 'json';
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  const idMatch = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  const id = idMatch?.[1] ?? null;

  if (strategy === 'json' && id) {
    try {
      const apiUrl = `https://api.immoweb.be/classified/${id}?language=nl&country=BE`;
      const res = await axios.get('https://api.scraperapi.com/', {
        params: { api_key: SCRAPER_KEY, url: apiUrl, country_code: 'be' },
        headers: { Accept: 'application/json' },
        timeout: 60_000,
        responseType: 'text',
      });
      const text = String(res.data ?? '');
      return NextResponse.json({
        strategy: 'json-api',
        bytes: text.length,
        first500: text.slice(0, 500),
        looksLikeJson: text.trimStart().startsWith('{'),
      });
    } catch (e) {
      return NextResponse.json({ strategy: 'json-api', error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (strategy === 'render') {
    try {
      const cleanUrl = url.split('?')[0];
      const res = await axios.get('https://api.scraperapi.com/', {
        params: { api_key: SCRAPER_KEY, url: cleanUrl, country_code: 'be', render: 'true' },
        timeout: 90_000,
        responseType: 'text',
      });
      const html = String(res.data ?? '');
      return NextResponse.json({
        strategy: 'js-render',
        bytes: html.length,
        first500: html.slice(0, 500),
        hasPropertyData: html.includes('"property"') && html.includes('"transaction"'),
      });
    } catch (e) {
      return NextResponse.json({ strategy: 'js-render', error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ error: 'Use ?strategy=json or ?strategy=render' }, { status: 400 });
}
