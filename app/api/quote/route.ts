import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getScan } from '@/lib/store';
import { sendMail, buildQuoteEmailHtml } from '@/lib/email';

const bodySchema = z.object({
  scanId: z.string().uuid(),
  selectedServices: z.array(z.string()).min(1, 'Selecteer minstens één dienst'),
  message: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { scanId, selectedServices, message } = parsed.data;
  const scan = getScan(scanId);
  if (!scan) {
    return NextResponse.json({ error: 'Scan niet gevonden.' }, { status: 404 });
  }

  const html = buildQuoteEmailHtml({
    email: scan.email,
    phone: scan.phone,
    url: scan.url,
    totalScore: scan.totalScore ?? 0,
    selectedServices,
    message,
  });

  const rflctEmail = process.env.RFLCT_EMAIL ?? 'info@rflct.be';
  try {
    await sendMail({
      to: rflctEmail,
      subject: `Offerte-aanvraag van ${scan.email} — scan ${scanId.slice(0, 8)}`,
      html,
    });
  } catch (err) {
    console.error('Quote email failed:', err);
    return NextResponse.json({ error: 'E-mail kon niet verstuurd worden. Probeer opnieuw.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
