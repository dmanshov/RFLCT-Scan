import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '2d98f5e2bc8104a5ef6f55f04bf06d92';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 });

  const res = await axios.get('https://api.scraperapi.com/', {
    params: { api_key: SCRAPER_KEY, url, country_code: 'be', render: 'false' },
    timeout: 90_000,
    responseType: 'text',
  });

  const html = String(res.data ?? '');
  const hasNextData = html.includes('__NEXT_DATA__');
  const scriptTags = Array.from(html.matchAll(/<script[^>]*>/g)).map(m => m[0]).slice(0, 20);

  return NextResponse.json({
    bytes: html.length,
    hasNextData,
    first500: html.slice(0, 500),
    scriptTags,
    nextDataSnippet: hasNextData
      ? html.slice(html.indexOf('__NEXT_DATA__') - 20, html.indexOf('__NEXT_DATA__') + 100)
      : null,
  });
}
