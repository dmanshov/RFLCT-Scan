'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ScoreGauge from '@/components/ScoreGauge';
import IndicatorCard from '@/components/IndicatorCard';
import RecommendationShop from '@/components/RecommendationShop';
import type { ScanRecord, ScanStatus } from '@/types/scan';

const STATUS_LABELS: Record<ScanStatus, string> = {
  pending: 'Scan wordt voorbereid…',
  scraping: 'Advertentie ophalen van Immoweb…',
  analyzing: 'Foto\'s en tekst analyseren met AI…',
  scoring: 'Scorekaart samenstellen…',
  done: 'Scan voltooid',
  error: 'Scan mislukt',
};

const STATUS_STEPS: ScanStatus[] = ['pending', 'scraping', 'analyzing', 'scoring', 'done'];

function ProgressBar({ status }: { status: ScanStatus }) {
  const stepIndex = STATUS_STEPS.indexOf(status);
  const pct = status === 'error' ? 100 : Math.round(((stepIndex + 1) / STATUS_STEPS.length) * 100);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {STATUS_STEPS.slice(0, -1).map((s, i) => (
          <div key={s} className="flex items-center gap-2 text-sm">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < stepIndex
                  ? 'bg-green-500 text-white'
                  : i === stepIndex
                  ? 'bg-brand-gold text-brand-dark animate-pulse-ring'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span className={i <= stepIndex ? 'text-gray-700 font-medium' : 'text-gray-400'}>
              {STATUS_LABELS[s]}
            </span>
          </div>
        ))}
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${status === 'error' ? 'bg-red-400' : 'bg-brand-gold'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PropertyHeader({ scan }: { scan: ScanRecord }) {
  const listing = scan.listing;
  if (!listing) return null;
  return (
    <div className="bg-brand-dark rounded-xl p-6 mb-8 flex flex-col sm:flex-row gap-4 justify-between items-start">
      <div>
        <p className="text-brand-gold text-xs font-bold uppercase tracking-widest mb-1">Geanalyseerde advertentie</p>
        <h2 className="text-white font-bold text-lg mb-1">{listing.title || listing.url}</h2>
        <div className="flex flex-wrap gap-4 text-white/50 text-xs mt-2">
          {listing.city && <span>📍 {listing.city} {listing.postalCode}</span>}
          {listing.photos.length > 0 && <span>📸 {listing.photos.length} foto's</span>}
          {listing.epcLabel && <span>⚡ EPC {listing.epcLabel}{listing.epcScore ? ` · ${listing.epcScore} kWh/m²/jaar` : ''}</span>}
          {listing.stats.daysOnline !== null && <span>📅 {listing.stats.daysOnline} dagen online</span>}
          {listing.stats.views !== null && <span>👁 {listing.stats.views} views</span>}
          {listing.stats.saves !== null && <span>🔖 {listing.stats.saves} bewaringen</span>}
        </div>
      </div>
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-outline shrink-0 text-xs"
      >
        Advertentie bekijken ↗
      </a>
    </div>
  );
}

export default function ScanResultPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Partial<ScanRecord> | null>(null);
  const [fetchError, setFetchError] = useState('');

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${id}`);
      if (!res.ok) {
        setFetchError('Scan niet gevonden.');
        return false;
      }
      const data: Partial<ScanRecord> = await res.json();
      setScan(data);
      return data.status === 'done' || data.status === 'error';
    } catch {
      setFetchError('Verbindingsfout. Pagina wordt herladen…');
      return false;
    }
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const done = await poll();
      if (!done) timer = setTimeout(tick, 2500);
    }
    tick();
    return () => clearTimeout(timer);
  }, [poll]);

  if (fetchError) {
    return (
      <>
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 font-semibold mb-2">{fetchError}</p>
            <a href="/" className="btn-primary mt-4">Nieuwe scan starten</a>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const status = scan?.status ?? 'pending';
  const isDone = status === 'done';
  const isError = status === 'error';

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-12">

        {/* Loading state */}
        {!isDone && !isError && (
          <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
            <div className="text-center">
              <div className="inline-block">
                <svg className="animate-spin h-12 w-12 text-brand-gold" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">Uw advertentie wordt geanalyseerd</h1>
              <p className="text-gray-500">Dit duurt doorgaans 30–90 seconden. U ontvangt ook een e-mail zodra het rapport klaar is.</p>
            </div>
            <div className="card p-6">
              <ProgressBar status={status as ScanStatus} />
            </div>
            {scan?.listing && <PropertyHeader scan={scan as ScanRecord} />}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="max-w-2xl mx-auto text-center animate-fade-in">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan kon niet voltooid worden</h1>
            <p className="text-gray-500 mb-2">{scan?.error ?? 'Er is een onverwachte fout opgetreden.'}</p>
            <p className="text-gray-400 text-sm mb-6">
              Zorg ervoor dat de URL correct is en van immoweb.be afkomstig is. Probeer het opnieuw of contacteer{' '}
              <a href="mailto:info@rflct.be" className="text-brand-gold hover:underline">info@rflct.be</a>.
            </p>
            <a href="/" className="btn-primary">Opnieuw proberen</a>
          </div>
        )}

        {/* Done state */}
        {isDone && scan?.scores && scan.totalScore !== undefined && (
          <div className="space-y-12 animate-fade-in">
            {/* Property info */}
            {scan.listing && <PropertyHeader scan={scan as ScanRecord} />}

            {/* Score overview */}
            <section>
              <div className="grid sm:grid-cols-3 gap-6 items-center">
                {/* Gauge */}
                <div className="flex flex-col items-center gap-4 card p-8">
                  <ScoreGauge score={scan.totalScore} size={180} />
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Totaalscore</p>
                    <p className={`font-bold text-sm mt-1 ${
                      scan.totalScore >= 70 ? 'text-green-600'
                      : scan.totalScore >= 50 ? 'text-orange-500'
                      : 'text-red-500'
                    }`}>
                      {scan.totalScore >= 70 ? 'Goed' : scan.totalScore >= 50 ? 'Gemiddeld' : 'Onvoldoende'}
                    </p>
                  </div>
                </div>

                {/* Work points summary */}
                <div className="sm:col-span-2 card p-6 h-full">
                  <h2 className="font-bold text-gray-900 text-lg mb-4">Voornaamste werkpunten</h2>
                  {scan.workPoints && scan.workPoints.length > 0 ? (
                    <ul className="space-y-2">
                      {scan.workPoints.slice(0, 6).map((pt, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-600">
                          <span className="text-brand-gold font-bold mt-0.5 shrink-0">→</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-green-600 font-semibold">Geen kritieke werkpunten — uw advertentie scoort uitstekend!</p>
                  )}
                </div>
              </div>
            </section>

            {/* Detailed indicators */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Scorekaart per indicator</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(scan.scores).map((ind) => (
                  <IndicatorCard key={ind.key} indicator={ind} />
                ))}
              </div>
            </section>

            {/* Recommendation shop */}
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Gepersonaliseerd advies & diensten</h2>
              <RecommendationShop
                recommendation={scan.recommendation!}
                scanId={id}
                totalScore={scan.totalScore}
              />
            </section>

            {/* PDF note */}
            {scan.pdfSent && (
              <div className="text-center text-sm text-gray-400">
                ✓ Een PDF-rapport werd verstuurd naar uw e-mailadres.
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
