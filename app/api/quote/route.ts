import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendMail, buildQuoteEmailHtml } from '@/lib/email';

const bodySchema = z.object({
  scanId: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  url: z.string().url(),
  totalScore: z.number(),
  selectedServices: z.array(z.string()).min(1, 'Selecteer minstens één dienst'),
  message: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { email, phone, url, totalScore, selectedServices, message } = parsed.data;

  const html = buildQuoteEmailHtml({ email, phone, url, totalScore, selectedServices, message });

  try {
    await sendMail({
      to: process.env.RFLCT_EMAIL ?? 'info@rflct.be',
      subject: `Offerte-aanvraag van ${email}`,
      html,
    });
  } catch (err) {
    console.error('Quote email failed:', err);
  }

  return NextResponse.json({ ok: true });
}
