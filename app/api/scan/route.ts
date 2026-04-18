import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { saveScan, updateScan } from '@/lib/store';
import { scrapeImmowebListing } from '@/lib/scraper';
import { analyzePhotos, analyzeText, analyzePhotoSequence } from '@/lib/analyzer';
import { calculateScores, deriveRecommendation, buildWorkPoints } from '@/lib/scorer';
import { generateScanPdf } from '@/lib/pdf';
import { sendMail, buildResultEmailHtml } from '@/lib/email';
import type { ScanRecord } from '@/types/scan';

const bodySchema = z.object({
  url: z.string().url('Ongeldige URL').includes('immoweb.be', { message: 'URL moet van immoweb.be zijn' }),
  email: z.string().email('Ongeldig e-mailadres'),
  phone: z.string().optional(),
});

async function runScan(id: string, url: string) {
  try {
    // Step 1: scrape
    updateScan(id, { status: 'scraping', statusMessage: 'Advertentie ophalen van Immoweb…' });
    const listing = await scrapeImmowebListing(url);
    updateScan(id, { listing, status: 'analyzing', statusMessage: 'Foto\'s en tekst analyseren met AI…' });

    // Step 2: AI analysis (parallel where possible)
    const [photoAnalysis, textAnalysis] = await Promise.all([
      analyzePhotos(listing.photos),
      analyzeText(listing.title, listing.description),
    ]);
    // Sequence analysis needs images too — do separately to avoid rate limits
    const sequenceAnalysis = await analyzePhotoSequence(listing.photos);

    // Step 3: scoring
    updateScan(id, { status: 'scoring', statusMessage: 'Scorekaart samenstellen…' });
    const { breakdown, total } = calculateScores({ listing, photoAnalysis, textAnalysis, sequenceAnalysis });
    const recommendation = deriveRecommendation(total, breakdown, listing);
    const workPoints = buildWorkPoints(breakdown);

    updateScan(id, { scores: breakdown, totalScore: total, recommendation, workPoints });

    // Step 4: PDF generation + email
    const scan = (await import('@/lib/store').then((m) => m.getScan(id)))!;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://scan.rflct.be';
    const reportUrl = `${baseUrl}/scan/${id}`;

    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await generateScanPdf(scan);
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
    }

    const emailHtml = buildResultEmailHtml({
      name: listing.agencyName,
      url,
      totalScore: total,
      workPoints,
      recommendation,
      reportUrl,
    });

    // Send to client
    if (scan.email) {
      try {
        await sendMail({
          to: scan.email,
          subject: `Uw RFLCT Advertentie-scan — score ${total}/100`,
          html: emailHtml,
          pdfBuffer,
          pdfFilename: `rflct-scan-${id}.pdf`,
        });
      } catch (mailErr) {
        console.error('Client email failed:', mailErr);
      }
    }

    // Send to RFLCT
    const rflctEmail = process.env.RFLCT_EMAIL ?? 'info@rflct.be';
    try {
      await sendMail({
        to: rflctEmail,
        subject: `Nieuwe scan: ${listing.title || url} — ${total}/100`,
        html: emailHtml,
        pdfBuffer,
        pdfFilename: `rflct-scan-${id}.pdf`,
      });
    } catch (mailErr) {
      console.error('RFLCT email failed:', mailErr);
    }

    updateScan(id, { status: 'done', statusMessage: 'Scan voltooid.', pdfSent: !!pdfBuffer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    updateScan(id, { status: 'error', statusMessage: 'Er is een fout opgetreden.', error: message });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { url, email, phone } = parsed.data;
  const id = uuidv4();

  const scan: ScanRecord = {
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
    statusMessage: 'Scan wordt voorbereid…',
    url,
    email,
    phone,
  };
  saveScan(scan);

  // Fire-and-forget — do not await so we return immediately
  runScan(id, url).catch(console.error);

  return NextResponse.json({ scanId: id });
}
