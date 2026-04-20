import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
  type DocumentProps,
} from '@react-pdf/renderer';
import type { ScanRecord, DimensionScore, SubScore, KernBevinding, Package, MicroService } from '@/types/scan';
import { PACKAGES, MICRO_SERVICES } from '@/types/scan';

Font.register({ family: 'Helvetica', src: 'Helvetica' });

const NAVY  = '#0F1B2D';
const GOLD  = '#C9A050';
const GRAY  = '#6B7280';
const LIGHT = '#F8F7F4';
const RED   = '#EF4444';
const GREEN = '#22C55E';
const ORANGE= '#F97316';

const s = StyleSheet.create({
  page:          { backgroundColor: '#FFFFFF', fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingBottom: 44 },
  header:        { backgroundColor: NAVY, padding: '22 40', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:   { color: GOLD, fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  headerSub:     { color: '#9CA3AF', fontSize: 9, marginTop: 2 },
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: NAVY, padding: '10 40', flexDirection: 'row', justifyContent: 'space-between' },
  footerText:    { color: '#9CA3AF', fontSize: 8 },
  section:       { marginHorizontal: 40, marginTop: 18 },
  sectionTitle:  { fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: GRAY, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  card:          { backgroundColor: LIGHT, borderRadius: 6, padding: '10 14', marginBottom: 6 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel:     { color: GRAY, fontSize: 9, width: 80 },
  infoValue:     { fontSize: 9, flex: 1 },
});

function verdictColor(v: string) {
  return v === 'good' ? GREEN : v === 'average' ? ORANGE : RED;
}

function Footer({ email }: { email: string }) {
  return React.createElement(View, { style: s.footer, fixed: true },
    React.createElement(Text, { style: s.footerText }, 'RFLCT · www.rflct.be · info@rflct.be'),
    React.createElement(Text, { style: s.footerText }, `Vertrouwelijk · ${email}`),
  );
}

// ─── Blok 1+2: Cover + Interpretatietekst ─────────────────────────────────

function PageCover({ scan }: { scan: ScanRecord }) {
  const listing = scan.listing!;
  const total   = scan.totalScore ?? 0;
  const rec     = scan.recommendation ?? 'ONLINE';
  const recNames: Record<string, string> = {
    COMPLEET: 'RFLCT Compleet aanbevolen',
    PRODUCTIE:'RFLCT Productie aanbevolen',
    BASIS:    'RFLCT Basis aanbevolen',
    ONLINE:   'RFLCT Online aanbevolen',
    MICRO:    'Gerichte micro-diensten aanbevolen',
  };
  const scoreColor = total >= 70 ? GREEN : total >= 50 ? ORANGE : RED;

  return React.createElement(Page, { size: 'A4', style: s.page },
    // Header
    React.createElement(View, { style: s.header },
      React.createElement(View, null,
        React.createElement(Text, { style: s.headerTitle }, 'RFLCT'),
        React.createElement(Text, { style: s.headerSub }, 'Advertentie-scan Rapport'),
      ),
      React.createElement(Text, { style: { color: '#9CA3AF', fontSize: 9 } }, new Date(scan.createdAt).toLocaleDateString('nl-BE')),
    ),

    // Blok 1 — Advertentie-info + score
    React.createElement(View, { style: s.section },
      React.createElement(Text, { style: s.sectionTitle }, 'Blok 1 — Advertentie & Totaalscore'),
      React.createElement(View, { style: { ...s.card, flexDirection: 'row', alignItems: 'flex-start', gap: 20 } },
        // Score cirkel
        React.createElement(View, { style: { width: 90, height: 90, borderRadius: 45, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' } },
          React.createElement(Text, { style: { color: scoreColor, fontSize: 32, fontFamily: 'Helvetica-Bold', lineHeight: 1 } }, `${total}`),
          React.createElement(Text, { style: { color: '#9CA3AF', fontSize: 10, marginTop: 2 } }, '/ 100'),
        ),
        // Info
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 4 } }, listing.title || listing.url),
          React.createElement(View, { style: { backgroundColor: GOLD, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 } },
            React.createElement(Text, { style: { color: NAVY, fontSize: 9, fontFamily: 'Helvetica-Bold' } }, recNames[rec] ?? rec),
          ),
          React.createElement(View, { style: { ...s.row, marginBottom: 3 } },
            React.createElement(Text, { style: s.infoLabel }, 'Locatie'),
            React.createElement(Text, { style: s.infoValue }, [
              listing.street,
              [listing.postalCode, listing.city].filter(Boolean).join(' '),
            ].filter(Boolean).join(', ') || '—'),
          ),
          React.createElement(View, { style: { ...s.row, marginBottom: 3 } },
            React.createElement(Text, { style: s.infoLabel }, "Foto's"),
            React.createElement(Text, { style: s.infoValue }, `${listing.photos.length}`),
          ),
          React.createElement(View, { style: { ...s.row, marginBottom: 3 } },
            React.createElement(Text, { style: s.infoLabel }, 'EPC'),
            React.createElement(Text, { style: s.infoValue }, listing.epcLabel ? `${listing.epcLabel}${listing.epcScore ? ` · ${listing.epcScore} kWh/m²/jaar` : ''}` : '—'),
          ),
          React.createElement(View, { style: s.row },
            React.createElement(Text, { style: s.infoLabel }, 'URL'),
            React.createElement(Text, { style: { ...s.infoValue, color: GRAY, fontSize: 8 } }, listing.url),
          ),
        ),
      ),
    ),

    // Blok 2 — Interpretatietekst
    scan.interpretatieText
      ? React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, 'Blok 2 — Interpretatie'),
          React.createElement(View, { style: { ...s.card, borderLeft: `3 solid ${GOLD}` } },
            React.createElement(Text, { style: { fontSize: 10, lineHeight: 1.6, color: '#374151' } }, scan.interpretatieText),
          ),
        )
      : null,

    // Aanbeveling toelichting
    scan.recommendationWhy
      ? React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, 'Aanbeveling — toelichting'),
          React.createElement(View, { style: s.card },
            React.createElement(Text, { style: { fontSize: 10, lineHeight: 1.5, color: '#374151' } }, scan.recommendationWhy),
          ),
        )
      : null,

    Footer({ email: scan.email }),
  );
}

// ─── Blok 3: Scorekaart ─────────────────────────────────────────────────────

function DimRow({ dim }: { dim: DimensionScore }) {
  const color = verdictColor(dim.verdict);
  return React.createElement(View, { style: { marginBottom: 10 } },
    // Dim header
    React.createElement(View, { style: { ...s.row, backgroundColor: NAVY, borderRadius: 5, padding: '6 10', marginBottom: 4 } },
      React.createElement(Text, { style: { flex: 1, color: '#FFFFFF', fontSize: 10, fontFamily: 'Helvetica-Bold' } }, dim.label),
      React.createElement(View, { style: { flex: 3, height: 6, backgroundColor: '#374151', borderRadius: 3, marginHorizontal: 10 } },
        React.createElement(View, { style: { height: 6, borderRadius: 3, backgroundColor: color, width: `${dim.percentage}%` } }),
      ),
      React.createElement(Text, { style: { color, fontFamily: 'Helvetica-Bold', fontSize: 10, minWidth: 40, textAlign: 'right' } }, `${dim.score}/${dim.maxScore}`),
    ),
    // Sub-scores
    ...dim.subScores.map((sub: SubScore) => SubRow({ sub })),
  );
}

function SubRow({ sub }: { sub: SubScore }) {
  if (sub.notApplicable) {
    return React.createElement(View, { key: sub.key, style: { ...s.row, paddingLeft: 10, paddingBottom: 3 } },
      React.createElement(Text, { style: { flex: 1, fontSize: 9, color: GRAY } }, sub.label),
      React.createElement(Text, { style: { fontSize: 8, color: GRAY, fontStyle: 'italic' } }, `N/v.t. — ${sub.naReason ?? ''}`),
    );
  }
  const pct = sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0;
  const color = pct >= 70 ? GREEN : pct >= 40 ? ORANGE : RED;
  return React.createElement(View, { key: sub.key, style: { ...s.row, paddingLeft: 10, paddingBottom: 3 } },
    React.createElement(Text, { style: { width: 130, fontSize: 9, color: '#374151' } }, sub.label),
    React.createElement(View, { style: { flex: 1, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginHorizontal: 6 } },
      React.createElement(View, { style: { height: 4, borderRadius: 2, backgroundColor: color, width: `${pct}%` } }),
    ),
    React.createElement(Text, { style: { color, fontSize: 9, fontFamily: 'Helvetica-Bold', width: 36, textAlign: 'right' } }, `${sub.score}/${sub.maxScore}`),
    // Issues (first only)
    sub.issues.length > 0
      ? React.createElement(Text, { style: { fontSize: 8, color: RED, flex: 2, marginLeft: 8 } }, `✗ ${sub.issues[0]}`)
      : sub.strengths.length > 0
      ? React.createElement(Text, { style: { fontSize: 8, color: GREEN, flex: 2, marginLeft: 8 } }, `✓ ${sub.strengths[0]}`)
      : null,
  );
}

function PageScorekaart({ scan }: { scan: ScanRecord }) {
  const dims = Object.values(scan.scores!);
  return React.createElement(Page, { size: 'A4', style: s.page },
    React.createElement(View, { style: s.header },
      React.createElement(Text, { style: s.headerTitle }, 'RFLCT · Scorekaart'),
    ),
    React.createElement(View, { style: { ...s.section, marginTop: 16 } },
      React.createElement(Text, { style: s.sectionTitle }, 'Blok 3 — Scorekaart per dimensie'),
      ...dims.map((dim) => DimRow({ dim })),
    ),

    // Werkpunten
    scan.workPoints && scan.workPoints.length > 0
      ? React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, 'Prioritaire werkpunten'),
          ...scan.workPoints.map((pt, i) =>
            React.createElement(View, { key: i, style: { ...s.row, paddingBottom: 4 } },
              React.createElement(Text, { style: { color: GOLD, fontFamily: 'Helvetica-Bold', fontSize: 11, width: 12 } }, '→'),
              React.createElement(Text, { style: { flex: 1, fontSize: 10, lineHeight: 1.4 } }, pt),
            ),
          ),
        )
      : null,

    Footer({ email: scan.email }),
  );
}

// ─── Blok 4: Kernbevindingen ─────────────────────────────────────────────────

function KbCard({ kb, i }: { kb: KernBevinding; i: number }) {
  return React.createElement(View, { style: { ...s.card, borderLeft: `3 solid ${GOLD}`, marginBottom: 10 } },
    React.createElement(Text, { style: { fontSize: 8, color: GOLD, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 } }, `Bevinding ${i + 1}`),
    React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 8 } }, kb.wat),
    React.createElement(Text, { style: { fontSize: 8, color: GRAY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 } }, 'Impact'),
    React.createElement(Text, { style: { fontSize: 9, color: '#374151', lineHeight: 1.5, marginBottom: 6 } }, kb.impact),
    React.createElement(Text, { style: { fontSize: 8, color: GRAY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 } }, 'Strategische lezing'),
    React.createElement(Text, { style: { fontSize: 9, color: '#374151', lineHeight: 1.5 } }, kb.strategischeLezing),
  );
}

function PageKernbevindingen({ scan }: { scan: ScanRecord }) {
  const kbs = scan.kernbevindingen ?? [];
  return React.createElement(Page, { size: 'A4', style: s.page },
    React.createElement(View, { style: s.header },
      React.createElement(Text, { style: s.headerTitle }, 'RFLCT · Kernbevindingen'),
    ),
    React.createElement(View, { style: { ...s.section, marginTop: 16 } },
      React.createElement(Text, { style: s.sectionTitle }, 'Blok 4 — Kernbevindingen'),
      ...(kbs.length > 0
        ? kbs.map((kb, i) => KbCard({ kb, i }))
        : [React.createElement(Text, { style: { fontSize: 10, color: GRAY } }, 'Geen kritieke bevindingen — uw advertentie scoort uitstekend.')]),
    ),

    // Blok 5 — Wettelijk detail (compliance)
    React.createElement(View, { style: s.section },
      React.createElement(Text, { style: s.sectionTitle }, 'Blok 5 — Wettelijk verplichte vermeldingen (detail)'),
      ...scan.scores!.dim4.subScores.map((sub: SubScore) => {
        const pct = sub.notApplicable ? 100 : sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0;
        const statusColor = sub.notApplicable ? GRAY : pct === 100 ? GREEN : pct > 0 ? ORANGE : RED;
        const statusText  = sub.notApplicable ? 'N/v.t.' : pct === 100 ? 'Voldoet' : pct > 0 ? 'Gedeeltelijk' : 'Ontbreekt';
        return React.createElement(View, { key: sub.key, style: { ...s.row, marginBottom: 5 } },
          React.createElement(Text, { style: { flex: 1, fontSize: 9 } }, sub.label),
          React.createElement(View, { style: { backgroundColor: sub.notApplicable ? '#F3F4F6' : pct === 100 ? '#DCFCE7' : pct > 0 ? '#FEF3C7' : '#FEE2E2', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 } },
            React.createElement(Text, { style: { fontSize: 8, color: statusColor, fontFamily: 'Helvetica-Bold' } }, statusText),
          ),
          sub.naReason
            ? React.createElement(Text, { style: { fontSize: 8, color: GRAY, flex: 2, marginLeft: 8, fontStyle: 'italic' } }, sub.naReason)
            : sub.issues.length > 0
            ? React.createElement(Text, { style: { fontSize: 8, color: RED, flex: 2, marginLeft: 8 } }, sub.issues[0])
            : null,
        );
      }),
    ),

    Footer({ email: scan.email }),
  );
}

// ─── Blok 6: Package card helper ─────────────────────────────────────────────

function PackageCard({ pkg, isRec }: { pkg: Package; isRec: boolean }) {
  return React.createElement(View, {
    key: pkg.id,
    style: {
      flex: 1,
      backgroundColor: isRec ? NAVY : LIGHT,
      borderRadius: 6,
      padding: '10 12',
      ...(isRec ? { borderTop: `3 solid ${GOLD}` } : {}),
    },
  },
    isRec
      ? React.createElement(View, { style: { backgroundColor: GOLD, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start', marginBottom: 5 } },
          React.createElement(Text, { style: { color: NAVY, fontSize: 7, fontFamily: 'Helvetica-Bold' } }, 'Aanbevolen'),
        )
      : null,
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 } },
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: isRec ? '#FFFFFF' : NAVY, flex: 1, marginRight: 4 } }, pkg.name),
      React.createElement(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: GOLD } }, `€${pkg.price.toLocaleString('nl-BE')}`),
    ),
    React.createElement(Text, { style: { fontSize: 8, color: isRec ? '#D1D5DB' : GRAY, lineHeight: 1.4, marginBottom: 5 } }, pkg.kernpositionering),
    React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 } },
      ...pkg.tags.map((t) =>
        React.createElement(View, { key: t, style: { backgroundColor: isRec ? '#1E3A5F' : '#E5E7EB', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1 } },
          React.createElement(Text, { style: { fontSize: 7, color: isRec ? '#93C5FD' : '#6B7280' } }, t),
        ),
      ),
    ),
  );
}

function MicroCard({ m, isRec }: { m: MicroService; isRec: boolean }) {
  return React.createElement(View, {
    key: m.id,
    style: {
      flex: 1,
      backgroundColor: LIGHT,
      borderRadius: 5,
      padding: '7 9',
      ...(isRec ? { borderTop: `2 solid ${GOLD}` } : {}),
    },
  },
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 } },
      React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, flex: 1, marginRight: 4 } }, m.name),
      isRec ? React.createElement(Text, { style: { fontSize: 9, color: GOLD } }, '★') : null,
    ),
    React.createElement(Text, { style: { fontSize: 9, color: GOLD, fontFamily: 'Helvetica-Bold', marginBottom: 2 } }, `€${m.price.toLocaleString('nl-BE')}`),
    React.createElement(Text, { style: { fontSize: 7, color: GRAY, lineHeight: 1.3 } }, m.description),
  );
}

// ─── Blok 6+7: Diensten & Offerte ────────────────────────────────────────────

function PageAanbeveling({ scan }: { scan: ScanRecord }) {
  const rec              = scan.recommendation ?? 'ONLINE';
  const recPkgId         = ({ COMPLEET: 'compleet', PRODUCTIE: 'productie', BASIS: 'basis', ONLINE: 'online', MICRO: null } as Record<string, string | null>)[rec] ?? null;
  const recommendedMicros = scan.recommendedMicros ?? [];

  // Group micro-services into rows of 3 for stable layout
  const microRows: MicroService[][] = [];
  for (let i = 0; i < MICRO_SERVICES.length; i += 3) microRows.push(MICRO_SERVICES.slice(i, i + 3));

  return React.createElement(Page, { size: 'A4', style: s.page },
    React.createElement(View, { style: s.header },
      React.createElement(Text, { style: s.headerTitle }, 'RFLCT · Diensten & Offerte'),
    ),

    // Blok 6 — Pakketten (2×2 grid)
    React.createElement(View, { style: { ...s.section, marginTop: 16 } },
      React.createElement(Text, { style: s.sectionTitle }, 'Blok 6 — Pakketten'),
      React.createElement(View, { style: { flexDirection: 'row', gap: 7, marginBottom: 7 } },
        PackageCard({ pkg: PACKAGES[0], isRec: PACKAGES[0].id === recPkgId }),
        PackageCard({ pkg: PACKAGES[1], isRec: PACKAGES[1].id === recPkgId }),
      ),
      React.createElement(View, { style: { flexDirection: 'row', gap: 7 } },
        PackageCard({ pkg: PACKAGES[2], isRec: PACKAGES[2].id === recPkgId }),
        PackageCard({ pkg: PACKAGES[3], isRec: PACKAGES[3].id === recPkgId }),
      ),
    ),

    // Micro-diensten (rows of 3)
    React.createElement(View, { style: s.section },
      React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
        React.createElement(Text, { style: { ...s.sectionTitle, marginBottom: 0 } }, 'Micro-diensten'),
        recommendedMicros.length > 0
          ? React.createElement(Text, { style: { fontSize: 8, color: GOLD } }, '★ = aanbevolen op basis van uw scan')
          : null,
      ),
      ...microRows.map((row, ri) =>
        React.createElement(View, { key: ri, style: { flexDirection: 'row', gap: 6, marginBottom: 6 } },
          ...row.map((m) => MicroCard({ m, isRec: recommendedMicros.includes(m.id) })),
        ),
      ),
    ),

    // Blok 7 — CTA
    React.createElement(View, { style: s.section },
      React.createElement(Text, { style: s.sectionTitle }, 'Blok 7 — Offerte aanvragen'),
      React.createElement(View, { style: { backgroundColor: NAVY, borderRadius: 8, borderTop: `4 solid ${GOLD}`, padding: '16 20' } },
        React.createElement(Text, { style: { color: GOLD, fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 } }, 'Klaar om uw advertentie naar het volgende niveau te tillen?'),
        React.createElement(Text, { style: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 8 } }, 'Vraag nu uw vrijblijvende offerte aan'),
        React.createElement(Text, { style: { color: '#D1D5DB', fontSize: 9, lineHeight: 1.6, marginBottom: 12 } },
          scan.recommendationWhy
            ?? 'Bezorg ons dit rapport en we stellen binnen 1 werkdag een persoonlijk aanbod op maat voor — zonder verbintenis.',
        ),
        React.createElement(View, { style: { flexDirection: 'row', gap: 24 } },
          React.createElement(View, null,
            React.createElement(Text, { style: { color: GOLD, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'E-mail'),
            React.createElement(Text, { style: { color: '#FFFFFF', fontSize: 10, marginTop: 2 } }, 'info@rflct.be'),
          ),
          React.createElement(View, null,
            React.createElement(Text, { style: { color: GOLD, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Website'),
            React.createElement(Text, { style: { color: '#FFFFFF', fontSize: 10, marginTop: 2 } }, 'www.rflct.be'),
          ),
          React.createElement(View, null,
            React.createElement(Text, { style: { color: GOLD, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Scan-ID'),
            React.createElement(Text, { style: { color: '#9CA3AF', fontSize: 9, marginTop: 2 } }, scan.id),
          ),
        ),
      ),
    ),

    Footer({ email: scan.email }),
  );
}

// ─── Root document ────────────────────────────────────────────────────────────

function RflctDocument({ scan }: { scan: ScanRecord }) {
  return React.createElement(
    Document,
    { title: `RFLCT Advertentie-scan — ${scan.listing?.title ?? scan.url}` },
    React.createElement(PageCover, { scan }),
    React.createElement(PageScorekaart, { scan }),
    React.createElement(PageKernbevindingen, { scan }),
    React.createElement(PageAanbeveling, { scan }),
  );
}

export async function generateScanPdf(scan: ScanRecord): Promise<Buffer> {
  const doc = React.createElement(RflctDocument, { scan }) as React.ReactElement<DocumentProps>;
  return await renderToBuffer(doc);
}
