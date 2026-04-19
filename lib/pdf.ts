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
import type { ScanRecord } from '@/types/scan';

Font.register({ family: 'Helvetica', src: 'Helvetica' });

const NAVY = '#0F1B2D';
const GOLD = '#C9A050';
const GRAY = '#6B7280';
const LIGHT = '#F8F7F4';
const RED = '#EF4444';
const GREEN = '#22C55E';
const ORANGE = '#F97316';

const styles = StyleSheet.create({
  page: { backgroundColor: '#FFFFFF', fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingBottom: 40 },
  header: { backgroundColor: NAVY, padding: '24 40', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  headerSub: { color: '#9CA3AF', fontSize: 9, marginTop: 2 },
  section: { marginHorizontal: 40, marginTop: 20 },
  sectionTitle: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: GRAY, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  scoreBox: { backgroundColor: NAVY, borderRadius: 8, padding: '20 32', flexDirection: 'row', alignItems: 'center', gap: 24 },
  scoreNumber: { color: '#FFFFFF', fontSize: 52, fontFamily: 'Helvetica-Bold', lineHeight: 1 },
  scoreOutOf: { color: GOLD, fontSize: 20 },
  scoreLabel: { color: '#9CA3AF', fontSize: 9, marginTop: 4 },
  recommendationBadge: { backgroundColor: GOLD, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  recommendationText: { color: NAVY, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  indicatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, backgroundColor: LIGHT, borderRadius: 6, padding: '8 12' },
  indicatorName: { flex: 3, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  indicatorBar: { flex: 5, height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, marginHorizontal: 12 },
  indicatorScore: { flex: 1, fontSize: 10, textAlign: 'right' },
  indicatorDetail: { marginHorizontal: 40, marginBottom: 10, paddingHorizontal: 12 },
  feedbackItem: { flexDirection: 'row', gap: 5, marginBottom: 3 },
  feedbackBullet: { fontSize: 9, width: 10, fontFamily: 'Helvetica-Bold' },
  feedbackText: { fontSize: 9, flex: 1, lineHeight: 1.4 },
  workpointItem: { flexDirection: 'row', marginBottom: 6, gap: 6 },
  bullet: { fontSize: 10, color: GOLD, fontFamily: 'Helvetica-Bold' },
  workpointText: { fontSize: 10, flex: 1, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: NAVY, padding: '12 40', flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { color: '#9CA3AF', fontSize: 8 },
  infoRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  infoLabel: { color: GRAY, fontSize: 9, width: 90 },
  infoValue: { fontSize: 9, flex: 1 },
});

function verdictColor(verdict: string) {
  if (verdict === 'good') return GREEN;
  if (verdict === 'average') return ORANGE;
  return RED;
}

function ScoreGaugePdf({ score }: { score: number }) {
  const color = score >= 70 ? GREEN : score >= 50 ? ORANGE : RED;
  return React.createElement(
    View,
    { style: { alignItems: 'center', justifyContent: 'center', width: 120, height: 120, borderRadius: 60, backgroundColor: NAVY } },
    React.createElement(Text, { style: { color, fontSize: 36, fontFamily: 'Helvetica-Bold', lineHeight: 1 } }, `${score}`),
    React.createElement(Text, { style: { color: '#9CA3AF', fontSize: 11, marginTop: 2 } }, '/ 100'),
  );
}

function RflctDocument({ scan }: { scan: ScanRecord }) {
  const listing = scan.listing!;
  const breakdown = scan.scores!;
  const total = scan.totalScore ?? 0;
  const rec = scan.recommendation ?? 'ONLINE';
  const workPoints = scan.workPoints ?? [];

  const recLabels: Record<string, string> = {
    PRODUCTIE: 'Productie Pakket aanbevolen',
    BASIS: 'Basis Pakket aanbevolen',
    ONLINE: 'Online Pakket aanbevolen',
    MICRO: 'Micro-diensten aanbevolen',
    PERFECT: 'Kwalitatieve scan — verdere optimalisatie mogelijk',
  };

  const indicators = Object.values(breakdown);

  return React.createElement(Document, { title: `RFLCT Advertentie-scan — ${listing.title || listing.url}` },
    // PAGE 1 — Score overview + indicator summary
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(View, { style: styles.header },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.headerTitle }, 'RFLCT'),
          React.createElement(Text, { style: styles.headerSub }, 'Advertentie-scan Rapport'),
        ),
        React.createElement(Text, { style: { color: '#9CA3AF', fontSize: 9 } }, new Date(scan.createdAt).toLocaleDateString('nl-BE')),
      ),

      // Property info
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Advertentie'),
        React.createElement(View, { style: { backgroundColor: LIGHT, borderRadius: 6, padding: '10 12' } },
          React.createElement(View, { style: styles.infoRow },
            React.createElement(Text, { style: styles.infoLabel }, 'Titel'),
            React.createElement(Text, { style: { ...styles.infoValue, fontFamily: 'Helvetica-Bold' } }, listing.title || '—'),
          ),
          React.createElement(View, { style: styles.infoRow },
            React.createElement(Text, { style: styles.infoLabel }, 'URL'),
            React.createElement(Text, { style: { ...styles.infoValue, color: GRAY } }, listing.url),
          ),
          React.createElement(View, { style: styles.infoRow },
            React.createElement(Text, { style: styles.infoLabel }, 'Locatie'),
            React.createElement(Text, { style: styles.infoValue }, [listing.city, listing.postalCode].filter(Boolean).join(' ') || '—'),
          ),
          React.createElement(View, { style: styles.infoRow },
            React.createElement(Text, { style: styles.infoLabel }, "Foto's"),
            React.createElement(Text, { style: styles.infoValue }, `${listing.photos.length}`),
          ),
        ),
      ),

      // Score
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Totaalscore'),
        React.createElement(View, { style: styles.scoreBox },
          React.createElement(ScoreGaugePdf, { score: total }),
          React.createElement(View, null,
            React.createElement(Text, { style: { color: '#FFFFFF', fontSize: 11, marginBottom: 6 } }, listing.title || listing.url),
            React.createElement(View, { style: styles.recommendationBadge },
              React.createElement(Text, { style: styles.recommendationText }, recLabels[rec]),
            ),
            React.createElement(Text, { style: styles.scoreLabel }, `Scan uitgevoerd op ${new Date(scan.createdAt).toLocaleDateString('nl-BE')}`),
          ),
        ),
      ),

      // Indicator bars
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Scorekaart per indicator'),
        ...indicators.map((ind) =>
          React.createElement(View, { key: ind.key, style: styles.indicatorRow },
            React.createElement(Text, { style: styles.indicatorName }, ind.label),
            React.createElement(View, { style: styles.indicatorBar },
              React.createElement(View, { style: { height: 6, borderRadius: 3, backgroundColor: verdictColor(ind.verdict), width: `${ind.percentage}%` } }),
            ),
            React.createElement(Text, { style: { ...styles.indicatorScore, color: verdictColor(ind.verdict) } }, `${ind.score}/${ind.maxScore}`),
          ),
        ),
      ),

      React.createElement(View, { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'RFLCT · www.rflct.be · info@rflct.be'),
        React.createElement(Text, { style: styles.footerText }, `Vertrouwelijk · ${scan.email}`),
      ),
    ),

    // PAGE 2 — Detailed per-indicator feedback
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(View, { style: styles.header },
        React.createElement(Text, { style: styles.headerTitle }, 'RFLCT · Gedetailleerde Feedback'),
      ),

      React.createElement(View, { style: { ...styles.section, marginBottom: 0 } },
        React.createElement(Text, { style: styles.sectionTitle }, 'Feedback per indicator'),
      ),

      ...indicators.map((ind) =>
        React.createElement(View, { key: ind.key, style: { marginHorizontal: 40, marginTop: 12 } },
          // Indicator header row
          React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', backgroundColor: LIGHT, borderRadius: 6, padding: '7 12', marginBottom: 4 } },
            React.createElement(Text, { style: { flex: 1, fontSize: 10, fontFamily: 'Helvetica-Bold' } }, ind.label),
            React.createElement(View, { style: { flex: 3, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, marginHorizontal: 12 } },
              React.createElement(View, { style: { height: 5, borderRadius: 3, backgroundColor: verdictColor(ind.verdict), width: `${ind.percentage}%` } }),
            ),
            React.createElement(Text, { style: { fontSize: 10, color: verdictColor(ind.verdict), fontFamily: 'Helvetica-Bold', minWidth: 36, textAlign: 'right' } }, `${ind.score}/${ind.maxScore}`),
          ),
          // Issues
          ...ind.issues.map((issue: string, i: number) =>
            React.createElement(View, { key: `issue-${i}`, style: { ...styles.feedbackItem, paddingLeft: 12 } },
              React.createElement(Text, { style: { ...styles.feedbackBullet, color: RED } }, '✗'),
              React.createElement(Text, { style: styles.feedbackText }, issue),
            ),
          ),
          // Strengths
          ...ind.strengths.map((str: string, i: number) =>
            React.createElement(View, { key: `str-${i}`, style: { ...styles.feedbackItem, paddingLeft: 12 } },
              React.createElement(Text, { style: { ...styles.feedbackBullet, color: GREEN } }, '✓'),
              React.createElement(Text, { style: styles.feedbackText }, str),
            ),
          ),
          // Fallback when no feedback
          (ind.issues.length === 0 && ind.strengths.length === 0)
            ? React.createElement(View, { style: { ...styles.feedbackItem, paddingLeft: 12 } },
                React.createElement(Text, { style: { ...styles.feedbackBullet, color: GREEN } }, '✓'),
                React.createElement(Text, { style: styles.feedbackText }, 'Geen opmerkingen — deze indicator scoort optimaal.'),
              )
            : null,
        ),
      ),

      React.createElement(View, { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'RFLCT · www.rflct.be · info@rflct.be'),
        React.createElement(Text, { style: styles.footerText }, `Vertrouwelijk · ${scan.email}`),
      ),
    ),

    // PAGE 3 — Work points & recommendation
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(View, { style: styles.header },
        React.createElement(Text, { style: styles.headerTitle }, 'RFLCT · Werkpunten & Advies'),
      ),

      workPoints.length > 0
        ? React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Prioritaire werkpunten'),
          ...workPoints.map((pt, i) =>
            React.createElement(View, { key: i, style: styles.workpointItem },
              React.createElement(Text, { style: styles.bullet }, '•'),
              React.createElement(Text, { style: styles.workpointText }, pt),
            ),
          ),
        )
        : React.createElement(View, { style: styles.section },
          React.createElement(Text, null, 'Geen kritieke werkpunten gevonden — uw advertentie scoort uitstekend!'),
        ),

      React.createElement(View, { style: { ...styles.section, marginTop: 24 } },
        React.createElement(Text, { style: styles.sectionTitle }, 'Aanbeveling'),
        React.createElement(View, { style: { backgroundColor: NAVY, borderRadius: 8, padding: '16 20' } },
          React.createElement(Text, { style: { color: GOLD, fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 8 } }, recLabels[rec]),
          React.createElement(Text, { style: { color: '#D1D5DB', fontSize: 10, lineHeight: 1.6 } },
            rec === 'PRODUCTIE'
              ? 'Uw advertentie mist essentiële elementen (grondplan, professionele foto\'s, conforme tekst). Een volledige productieopdracht biedt de sterkste resultaatverbetering.'
              : rec === 'BASIS'
              ? 'Met een Basis Pakket verbeteren we uw foto\'s en tekst snel en gericht, zonder grote investering.'
              : rec === 'ONLINE'
              ? 'Met het Online Pakket boosten we uw zichtbaarheid via gerichte publicatie-aanpak en sociale media — ideaal om meer kopers te bereiken.'
              : rec === 'MICRO'
              ? 'Gerichte micro-diensten lossen de specifieke zwakke punten op en tillen uw advertentie naar een hoger niveau.'
              : 'Uw advertentie is van uitstekende kwaliteit. Het Online Pakket kan uw bereik nog verder vergroten.',
          ),
        ),
      ),

      React.createElement(View, { style: { ...styles.section, marginTop: 16 } },
        React.createElement(Text, { style: { fontSize: 10, color: GRAY, lineHeight: 1.6 } },
          'Voor vragen of om een afspraak te maken: info@rflct.be · www.rflct.be',
        ),
      ),

      React.createElement(View, { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'RFLCT · www.rflct.be · info@rflct.be'),
        React.createElement(Text, { style: styles.footerText }, `Vertrouwelijk · ${scan.email}`),
      ),
    ),
  );
}

export async function generateScanPdf(scan: ScanRecord): Promise<Buffer> {
  const doc = React.createElement(RflctDocument, { scan }) as React.ReactElement<DocumentProps>;
  return await renderToBuffer(doc);
}
