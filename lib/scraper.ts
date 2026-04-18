import axios from 'axios';
import { load } from 'cheerio';
import type { ImmowebListing } from '@/types/scan';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

export async function scrapeImmowebListing(url: string): Promise<ImmowebListing> {
  if (!url.includes('immoweb.be')) {
    throw new Error('Enkel Immoweb-advertenties worden ondersteund (url moet immoweb.be bevatten).');
  }

  let html: string;
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 30_000,
      maxRedirects: 5,
    });
    html = response.data as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Kon de advertentie niet ophalen: ${msg}`);
  }

  const $ = load(html);

  // Immoweb is built with Next.js — all listing data lives in __NEXT_DATA__
  const nextDataScript = $('script#__NEXT_DATA__').html() ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextData: any = null;
  try {
    nextData = JSON.parse(nextDataScript);
  } catch {
    // fall through to HTML fallback
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: any = nextData?.props?.pageProps ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listing: any = props?.classified ?? props?.listing ?? props?.classifiedProperty ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const property: any = listing?.property ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transaction: any = listing?.transaction ?? {};

  // ── Photos ──────────────────────────────────────────────────────────
  const photos: string[] = [];
  const floorPlans: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pictures: any[] = listing?.media?.pictures ?? [];
  for (const pic of pictures) {
    const picUrl: string = pic.largeUrl ?? pic.url ?? pic.mediumUrl ?? '';
    if (!picUrl) continue;
    if (pic.type === 'FLOOR_PLAN' || pic.category === 'FLOOR_PLAN' || pic.type === 'plan') {
      floorPlans.push(picUrl);
    } else {
      photos.push(picUrl);
    }
  }

  // HTML fallback when __NEXT_DATA__ parsing failed or has no media
  if (photos.length === 0) {
    $('img').each((_, el) => {
      const src = $(el).attr('src') ?? '';
      if (src.includes('picture.immoweb') || src.includes('immoweb-cdn')) {
        photos.push(src);
      }
    });
  }

  // ── EPC ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const energy: any =
    property?.energy ??
    listing?.specificities?.energy ??
    listing?.energy ??
    {};
  const epcScore: number | null =
    energy.primaryEnergyConsumptionPerSqm ??
    energy.primaryEnergyConsumption ??
    listing?.specificities?.energyConsumption ??
    null;
  const epcLabel: string | null =
    energy.epcScore ?? energy.energyClass ?? listing?.specificities?.energyClass ?? null;

  // ── Description & title ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const descObj: any = listing?.description ?? {};
  const description: string =
    (typeof descObj === 'string' ? descObj : descObj?.nl ?? descObj?.fr ?? descObj?.en ?? '') ||
    $('[class*="description"]').text().trim();

  const title: string =
    listing?.cluster?.title ??
    listing?.propertyName ??
    $('h1').first().text().trim() ??
    '';

  // ── Location ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const location: any = property?.location ?? listing?.location ?? {};
  const city: string = location?.locality ?? location?.municipality ?? '';
  const postalCode: string = String(location?.postalCode ?? '');

  // ── Agency / contact ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customers: any[] = listing?.customers ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstCustomer: any = customers[0] ?? {};
  const agencyName: string | null = firstCustomer?.name ?? null;
  const agencyPhone: string | null = firstCustomer?.phone ?? null;
  const agencyEmail: string | null = firstCustomer?.email ?? null;

  // ── Stats ─────────────────────────────────────────────────────────────
  let daysOnline: number | null = null;
  const pubDateStr: string | null =
    listing?.publication?.publicationDate ??
    listing?.publicationDate ??
    null;
  if (pubDateStr) {
    const pubDate = new Date(pubDateStr);
    daysOnline = Math.floor((Date.now() - pubDate.getTime()) / 86_400_000);
  }

  // Views/saves are only visible to logged-in owners — parse if present
  let views: number | null = null;
  let saves: number | null = null;
  const statsText = $('[data-testid*="statistic"], [class*="statistic"]').text();
  const viewsMatch = statsText.match(/(\d[\d\s.]*)\s*(?:keer bekeken|vues|views)/i);
  if (viewsMatch) views = parseInt(viewsMatch[1].replace(/\D/g, ''));
  const savesMatch = statsText.match(/(\d[\d\s.]*)\s*(?:keer bewaard|sauvegardé|saved)/i);
  if (savesMatch) saves = parseInt(savesMatch[1].replace(/\D/g, ''));

  // ── Compliance mentions ───────────────────────────────────────────────
  const descLower = description.toLowerCase();
  const compliance = {
    hasRenovationObligation:
      descLower.includes('renovatieplicht') ||
      descLower.includes('rénovation obligatoire') ||
      descLower.includes('renovatieverplichting'),
    hasAsbestosInfo:
      descLower.includes('asbest') ||
      descLower.includes('asbestattest') ||
      descLower.includes('amiante'),
    hasEpcLabel: !!epcLabel,
    hasFloodRisk:
      descLower.includes('overstromingsgevoeligheid') ||
      descLower.includes('watertoets') ||
      descLower.includes('risque d\'inondation') ||
      descLower.includes('p-score') ||
      descLower.includes('g-score'),
  };

  return {
    id: String(listing?.id ?? url.split('/').filter(Boolean).pop() ?? 'unknown'),
    url,
    title,
    description,
    price: transaction?.sale?.price ?? listing?.price?.mainValue ?? null,
    propertyType: property?.type ?? listing?.type ?? 'UNKNOWN',
    city,
    postalCode,
    photos,
    floorPlans,
    epcScore,
    epcLabel,
    area: property?.netHabitableSurface ?? property?.livingArea ?? null,
    bedrooms: property?.bedroomCount ?? null,
    bathrooms: property?.bathroomCount ?? null,
    constructionYear: property?.building?.constructionYear ?? null,
    agencyName,
    agencyPhone,
    agencyEmail,
    stats: { daysOnline, views, saves },
    compliance,
  };
}
