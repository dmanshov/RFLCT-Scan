import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { saveScan } from '@/lib/store';
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

  try {
    // Step 1 — scrape
    scan.status = 'scraping';
    scan.statusMessage = 'Advertentie ophalen van Immoweb…';
    const listing = await scrapeImmowebListing(url);
    scan.listing = listing;

    // Step 2 — AI analysis: run all three in parallel for speed
    scan.status = 'analyzing';
    scan.statusMessage = "Foto's en tekst analyseren met AI…";
    const [photoAnalysis, textAnalysis, sequenceAnalysis] = await Promise.all([
      analyzePhotos(listing.photos),
      analyzeText(listing.title, listing.description),
      analyzePhotoSequence(listing.photos),
    ]);

    // Step 3 — scoring
    scan.status = 'scoring';
    scan.statusMessage = 'Scorekaart samenstellen…';
    const { breakdown, total } = calculateScores({ listing, photoAnalysis, textAnalysis, sequenceAnalysis });
    scan.scores = breakdown;
    scan.totalScore = total;
    scan.recommendation = deriveRecommendation(total, breakdown, listing);
    scan.workPoints = buildWorkPoints(breakdown);
    scan.status = 'done';
    scan.statusMessage = 'Scan voltooid.';

    // Persist for same-instance GET fallback
    saveScan(scan);

    // Step 4 — PDF + email (best-effort, non-blocking via void)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://scan.rflct.be';
    void (async () => {
      try {
        const pdfBuffer = await generateScanPdf(scan);
        const html = buildResultEmailHtml({
          name: listing.agencyName,
          url,
          totalScore: total,
          workPoints: scan.workPoints!,
          recommendation: scan.recommendation!,
          reportUrl: `${baseUrl}/scan/${id}`,
        });
        await Promise.all([
          sendMail({ to: email, subject: `Uw RFLCT Advertentie-scan — score ${total}/100`, html, pdfBuffer, pdfFilename: `rflct-scan-${id}.pdf` }),
          sendMail({ to: process.env.RFLCT_EMAIL ?? 'info@rflct.be', subject: `Nieuwe scan: ${listing.title || url} — ${total}/100`, html, pdfBuffer, pdfFilename: `rflct-scan-${id}.pdf` }),
        ]);
        scan.pdfSent = true;
        saveScan(scan);
      } catch (mailErr) {
        console.error('PDF/mail failed (non-fatal):', mailErr);
      }
    })();

    // Return full scan result — client caches in sessionStorage
    return NextResponse.json({ scanId: id, scan });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    scan.status = 'error';
    scan.statusMessage = 'Er is een fout opgetreden.';
    scan.error = message;
    saveScan(scan);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
