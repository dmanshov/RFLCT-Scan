import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { saveScan } from '@/lib/store';
import { scrapeImmowebListing } from '@/lib/scraper';
import { analyzePhotos, analyzeText } from '@/lib/analyzer';
import { calculateScores, deriveRecommendation, buildWorkPoints } from '@/lib/scorer';
import { generateScanPdf } from '@/lib/pdf';
import { sendMail, buildResultEmailHtml } from '@/lib/email';
import type { ScanRecord } from '@/types/scan';
import type { SequenceAnalysisResult } from '@/lib/analyzer';

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
  const encoder = new TextEncoder();

  let controller!: ReadableStreamDefaultController;
  const stream = new ReadableStream({ start(c) { controller = c; } });

  function emit(data: object) {
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
    catch { /* client disconnected */ }
  }

  void (async () => {
    const scan: ScanRecord = {
      id,
      createdAt: new Date().toISOString(),
      status: 'pending',
      statusMessage: 'Start…',
      url,
      email,
      phone,
    };

    try {
      // Step 1 — Scrape
      emit({ type: 'status', message: 'Advertentie ophalen van Immoweb…' });
      scan.status = 'scraping';
      const listing = await scrapeImmowebListing(url);
      scan.listing = listing;

      // Step 2 — AI analysis
      emit({ type: 'status', message: "Foto's en tekst analyseren met AI…" });
      scan.status = 'analyzing';
      const [photoAnalysis, textAnalysis] = await Promise.all([
        analyzePhotos(listing.photos),
        analyzeText(listing.title, listing.description),
      ]);
      const sequenceAnalysis: SequenceAnalysisResult = { score: 60, logicalFlow: true, issues: [] };

      // Step 3 — Score
      emit({ type: 'status', message: 'Scorekaart samenstellen…' });
      scan.status = 'scoring';
      const { breakdown, total } = calculateScores({ listing, photoAnalysis, textAnalysis, sequenceAnalysis });
      scan.scores = breakdown;
      scan.totalScore = total;
      scan.recommendation = deriveRecommendation(total, breakdown, listing);
      scan.workPoints = buildWorkPoints(breakdown);
      scan.status = 'done';
      scan.statusMessage = 'Scan voltooid.';
      saveScan(scan);

      // Emit done — client navigates immediately, stream stays open for email
      emit({ type: 'done', scanId: id, scan });

      // Step 4 — PDF + email (awaited before closing stream — keeps function alive)
      emit({ type: 'status', message: 'Rapport versturen per e-mail…' });
      try {
        const pdfBuffer = await generateScanPdf(scan);
        const html = buildResultEmailHtml({
          name: listing.agencyName,
          url,
          totalScore: total,
          workPoints: scan.workPoints!,
          recommendation: scan.recommendation!,
        });
        const sendTo = async (to: string, subject: string) => {
          try {
            await sendMail({ to, subject, html, pdfBuffer, pdfFilename: `rflct-scan-${id}.pdf` });
            console.info('[scan] Email sent to', to);
          } catch (e) {
            console.error('[scan] Email failed for', to, e);
          }
        };
        await Promise.all([
          sendTo(email, `Uw RFLCT Advertentie-scan — score ${total}/100`),
          sendTo(process.env.RFLCT_EMAIL ?? 'info@rflct.be', `Nieuwe scan: ${listing.title || url} — ${total}/100`),
        ]);
      } catch (mailErr) {
        console.error('[scan] Email failed:', mailErr);
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      scan.status = 'error';
      scan.error = message;
      saveScan(scan);
      emit({ type: 'error', message });
    } finally {
      try { controller.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    },
  });
}
