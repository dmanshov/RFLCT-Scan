import nodemailer from 'nodemailer';

interface MailOptions {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendMail(opts: MailOptions) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP not configured — skipping send to', opts.to);
    return;
  }
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? '"RFLCT Advertentie-scan" <noreply@rflct.be>',
    to: opts.to,
    ...(opts.cc ? { cc: opts.cc } : {}),
    subject: opts.subject,
    html: opts.html,
    attachments: opts.pdfBuffer
      ? [{ filename: opts.pdfFilename ?? 'rflct-rapport.pdf', content: opts.pdfBuffer }]
      : undefined,
  });
}

export function buildResultEmailHtml(opts: {
  name: string | null;
  url: string;
  totalScore: number;
  workPoints: string[];
  recommendation: string;
}): string {
  const { name, url, totalScore, workPoints, recommendation } = opts;
  const greeting = name ? `Beste ${name}` : 'Beste';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, sans-serif; color: #111827; background: #F8F7F4; margin:0; padding:0; }
  .wrap { max-width:600px; margin:0 auto; background:#fff; }
  .header { background:#0F1B2D; padding:32px 40px; }
  .header h1 { color:#C9A050; margin:0; font-size:22px; letter-spacing:0.05em; }
  .body { padding:32px 40px; }
  .score { font-size:48px; font-weight:700; color:#0F1B2D; margin:16px 0 4px; }
  .score-label { color:#6B7280; font-size:14px; margin-bottom:24px; }
  .section { margin-bottom:24px; }
  .section h2 { font-size:14px; text-transform:uppercase; letter-spacing:0.08em; color:#6B7280; margin:0 0 8px; }
  ul { margin:0; padding-left:20px; }
  li { margin-bottom:4px; font-size:14px; }
  .cta { display:inline-block; background:#C9A050; color:#0F1B2D; padding:14px 28px; border-radius:4px; text-decoration:none; font-weight:700; font-size:15px; margin-top:16px; }
  .footer { background:#F8F7F4; padding:24px 40px; font-size:12px; color:#9CA3AF; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>RFLCT · Advertentie-scan</h1>
  </div>
  <div class="body">
    <p>${greeting},</p>
    <p>Uw RFLCT Advertentie-scan is klaar. Hieronder vindt u een beknopt overzicht. Het volledige rapport vindt u in bijlage (PDF).</p>

    <div class="section">
      <h2>Totaalscore</h2>
      <div class="score">${totalScore}<span style="font-size:24px;color:#9CA3AF;">/100</span></div>
      <div class="score-label">Aanbeveling: <strong>${recommendation}</strong></div>
    </div>

    ${
      workPoints.length > 0
        ? `<div class="section">
      <h2>Verbeterpunten</h2>
      <ul>
        ${workPoints.slice(0, 6).map((p) => `<li>${p}</li>`).join('')}
      </ul>
    </div>`
        : ''
    }

    <p>Heeft u vragen of wenst u een van onze diensten? Ons team staat klaar om u verder te helpen.</p>
    <a class="cta" href="https://www.rflct.be">Bezoek rflct.be</a>

    <p style="margin-top:32px;font-size:13px;color:#6B7280;">
      Of stuur een e-mail naar <a href="mailto:info@rflct.be">info@rflct.be</a> — wij nemen contact met u op.
    </p>
  </div>
  <div class="footer">
    RFLCT · <a href="https://www.rflct.be">www.rflct.be</a><br/>
    Advertentie: <a href="${url}">${url}</a>
  </div>
</div>
</body>
</html>`;
}

export function buildQuoteEmailHtml(opts: {
  email: string;
  phone?: string;
  url: string;
  totalScore: number;
  selectedServices: string[];
  message?: string;
}): string {
  const { email, phone, url, totalScore, selectedServices, message } = opts;
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8" /><style>
  body{font-family:Arial,sans-serif;color:#111827;background:#F8F7F4;margin:0;padding:0;}
  .wrap{max-width:600px;margin:0 auto;background:#fff;}
  .header{background:#0F1B2D;padding:32px 40px;}
  .header h1{color:#C9A050;margin:0;font-size:20px;}
  .body{padding:32px 40px;}
  dt{font-weight:700;font-size:13px;color:#6B7280;text-transform:uppercase;margin-top:12px;}
  dd{margin:4px 0 0;font-size:15px;}
</style></head>
<body><div class="wrap">
  <div class="header"><h1>RFLCT · Nieuwe offerte-aanvraag</h1></div>
  <div class="body">
    <p>Er is een nieuwe offerte-aanvraag binnengekomen via de Advertentie-scan.</p>
    <dl>
      <dt>E-mail</dt><dd>${email}</dd>
      ${phone ? `<dt>Telefoon</dt><dd>${phone}</dd>` : ''}
      <dt>Immoweb-advertentie</dt><dd><a href="${url}">${url}</a></dd>
      <dt>Totaalscore</dt><dd>${totalScore}/100</dd>
      <dt>Gevraagde diensten</dt><dd>${selectedServices.join(', ') || '—'}</dd>
      ${message ? `<dt>Bericht</dt><dd>${message}</dd>` : ''}
    </dl>
  </div>
</div></body></html>`;
}
