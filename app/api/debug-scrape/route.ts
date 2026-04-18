import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  // Extract listing ID from URL
  const idMatch = url.match(/\/(\d{6,9})(?:[?#]|$)/);
  const id = idMatch?.[1] ?? null;

  const results: Record<string, unknown> = { url, id };

  // Test 1: ScraperAPI → Immoweb JSON API
  if (id) {
    try {
      const apiUrl = `https://api.immoweb.be/classified/${id}?language=nl&country=BE`;
      const res = await axios.get('https://api.scraperapi.com/', {
        params: { api_key: SCRAPER_KEY, url: apiUrl, country_code: 'be' },
        headers: { Accept: 'application/json' },
        timeout: 60_000,
        responseType: 'text',
      });
      const text = String(res.data ?? '');
      results.jsonApi = {
        bytes: text.length,
        first300: text.slice(0, 300),
        looksLikeJson: text.trimStart().startsWith('{'),
      };
    } catch (e) {
      results.jsonApi = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Test 2: ScraperAPI → HTML with JS rendering
  try {
    const cleanUrl = url.split('?')[0];
    const res = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: SCRAPER_KEY, url: cleanUrl, country_code: 'be', render: 'true', wait: 3000 },
      timeout: 120_000,
      responseType: 'text',
    });
    const html = String(res.data ?? '');
    results.jsRender = {
      bytes: html.length,
      first500: html.slice(0, 500),
      hasListingData: html.includes('"property"') && html.includes('"transaction"'),
      hasApplicationLdJson: html.includes('application/ld+json'),
    };
  } catch (e) {
    results.jsRender = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(results);
}
