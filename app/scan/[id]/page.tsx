'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ScoreGauge from '@/components/ScoreGauge';
import IndicatorCard from '@/components/IndicatorCard';
import RecommendationShop from '@/components/RecommendationShop';
import type { ScanRecord } from '@/types/scan';

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
          {listing.photos.length > 0 && <span>📸 {listing.photos.length} foto&apos;s</span>}
          {listing.epcLabel && <span>⚡ EPC {listing.epcLabel}{listing.epcScore ? ` · ${listing.epcScore} kWh/m²/jaar` : ''}</span>}
          {listing.stats.daysOnline !== null && <span>📅 {listing.stats.daysOnline} dagen online</span>}
          {listing.stats.views !== null && <span>👁 {listing.stats.views} views</span>}
          {listing.stats.saves !== null && <span>🔖 {listing.stats.saves} bewaringen</span>}
        </div>
      </div>
      <a href={listing.url} target="_blank" rel="noopener noreferrer" className="btn-outline shrink-0 text-xs">
        Advertentie bekijken ↗
      </a>
    </div>
  );
}

export default function ScanResultPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    // 1. Try sessionStorage first (set by landing page after sync scan)
    const cached = sessionStorage.getItem(`rflct-scan-${id}`);
    if (cached) {
      try {
        setScan(JSON.parse(cached) as ScanRecord);
        setLoading(false);
        return;
      } catch {
        // corrupt cache — fall through to API
        sessionStorage.removeItem(`rflct-scan-${id}`);
      }
    }

    // 2. Fall back to API (same-instance hit, or shared link)
    fetch(`/api/scan/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Scan niet gevonden.');
        return res.json() as Promise<ScanRecord>;
      })
      .then((data) => {
        setScan(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Onbekende fout');
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center">
          <svg className="animate-spin h-10 w-10 text-brand-gold" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        <Footer />
      </>
    );
  }

  if (fetchError || !scan) {
    return (
      <>
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-5xl mb-4">⚠️</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Scan niet gevonden</h1>
            <p className="text-gray-500 text-sm mb-6">{fetchError || 'Dit rapport is mogelijk verlopen of bestaat niet.'}</p>
            <a href="/" className="btn-primary">Nieuwe scan starten</a>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (scan.status === 'error') {
    return (
      <>
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center px-6 max-w-lg">
            <p className="text-5xl mb-4">⚠️</p>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan kon niet voltooid worden</h1>
            <p className="text-gray-500 mb-2">{scan.error ?? 'Er is een onverwachte fout opgetreden.'}</p>
            <p className="text-gray-400 text-sm mb-6">
              Zorg dat de URL correct is en van immoweb.be afkomstig is. Probeer opnieuw of contacteer{' '}
              <a href="mailto:info@rflct.be" className="text-brand-gold hover:underline">info@rflct.be</a>.
            </p>
            <a href="/" className="btn-primary">Opnieuw proberen</a>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-12 animate-fade-in">

        {/* Property header */}
        {scan.listing && <PropertyHeader scan={scan} />}

        {/* Score overview */}
        {scan.scores && scan.totalScore !== undefined && (
          <>
            <section>
              <div className="grid sm:grid-cols-3 gap-6 items-start">
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

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Scorekaart per indicator</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(scan.scores).map((ind) => (
                  <IndicatorCard key={ind.key} indicator={ind} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Gepersonaliseerd advies & diensten</h2>
              <RecommendationShop
                recommendation={scan.recommendation!}
                scanId={id}
                totalScore={scan.totalScore}
              />
            </section>

            {scan.pdfSent && (
              <p className="text-center text-sm text-gray-400">
                ✓ Een PDF-rapport werd verstuurd naar uw e-mailadres.
              </p>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
