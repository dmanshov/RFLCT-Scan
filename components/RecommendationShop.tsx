'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { PACKAGES, MICRO_SERVICES, SERVICES } from '@/types/scan';
import type { Recommendation } from '@/types/scan';

interface Props {
  recommendation: Recommendation;
  recommendedMicros: string[];
  scanId: string;
  totalScore: number;
  scanEmail: string;
  scanPhone?: string;
  scanUrl: string;
}

const REC_DEFAULT_PACKAGE: Record<Recommendation, string | null> = {
  COMPLEET:  'compleet',
  PRODUCTIE: 'productie',
  BASIS:     'basis',
  ONLINE:    'online',
  MICRO:     null,
};

const REC_HEADLINE: Record<Recommendation, { title: string; body: string }> = {
  COMPLEET: {
    title: 'RFLCT Compleet aanbevolen',
    body: 'Fundamentele tekortkomingen op meerdere vlakken vragen om een geïntegreerde aanpak — van strategie en fotografie tot begeleiding bij biedingen.',
  },
  PRODUCTIE: {
    title: 'RFLCT Productie aanbevolen',
    body: 'De visuele presentatie is de cruciale bottleneck. Professionele fotografie, grondplan en Premium Immoweb-zichtbaarheid leveren de grootste return op investering.',
  },
  BASIS: {
    title: 'RFLCT Basis aanbevolen',
    body: 'Compliance-risico\'s en tekortkomingen in de tekst vragen om begeleide aanpak. Coaching + volledige productie zorgt voor een correcte, overtuigende advertentie.',
  },
  ONLINE: {
    title: 'RFLCT Online aanbevolen',
    body: 'Uw advertentie heeft een goede basis. AI-retouche van bestaande foto\'s + RFLCT-webpagina + sociale media vergroot uw bereik direct.',
  },
  MICRO: {
    title: 'Gerichte micro-diensten aanbevolen',
    body: 'De advertentie is solide maar heeft specifieke lacunes. Selecteer de diensten die de gedetecteerde zwakke punten efficiënt aanpakken.',
  },
};

export default function RecommendationShop({
  recommendation, recommendedMicros, scanId, totalScore, scanEmail, scanPhone, scanUrl,
}: Props) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(REC_DEFAULT_PACKAGE[recommendation]);
  const [selectedMicros, setSelectedMicros]   = useState<Set<string>>(new Set(recommendedMicros));
  const [message,     setMessage]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [error,       setError]       = useState('');

  const { title, body } = REC_HEADLINE[recommendation];

  function toggleMicro(id: string) {
    setSelectedMicros((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allSelected = [...(selectedPackage ? [selectedPackage] : []), ...Array.from(selectedMicros)];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (allSelected.length === 0) {
      setError('Selecteer minstens één dienst om een offerte aan te vragen.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, email: scanEmail, phone: scanPhone, url: scanUrl, totalScore, selectedServices: allSelected, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Onbekende fout');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is een fout opgetreden.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-brand-dark rounded-xl p-10 text-center animate-fade-in">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-brand-gold font-bold text-xl mb-2">Aanvraag verzonden!</h2>
        <p className="text-white/70 text-sm max-w-md mx-auto">
          Ons team neemt binnen 1 werkdag contact met u op voor een persoonlijk aanbod op maat.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-8 animate-fade-in">
      {/* Recommendation banner */}
      <div className="bg-brand-dark rounded-xl p-8">
        <p className="text-brand-gold text-xs font-bold uppercase tracking-widest mb-2">Onze aanbeveling</p>
        <h2 className="text-white font-bold text-2xl mb-3">{title}</h2>
        <p className="text-white/70 text-sm leading-relaxed max-w-2xl">{body}</p>
      </div>

      <form onSubmit={submit} className="space-y-8">
        {/* Packages */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Pakketten</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PACKAGES.map((pkg) => {
              const isSelected = selectedPackage === pkg.id;
              const isRec = REC_DEFAULT_PACKAGE[recommendation] === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackage(isSelected ? null : pkg.id)}
                  className={clsx(
                    'text-left p-5 rounded-lg border-2 transition-all duration-200 relative',
                    isSelected ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-100 hover:border-brand-gold/40',
                  )}
                >
                  {isRec && (
                    <span className="absolute top-3 right-3 bg-brand-gold text-brand-dark text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                      Aanbevolen
                    </span>
                  )}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={clsx(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      isSelected ? 'border-brand-gold bg-brand-gold' : 'border-gray-300',
                    )}>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-brand-dark block" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{pkg.name}</h4>
                      <p className="text-brand-gold font-bold text-sm">€{pkg.price.toLocaleString('nl-BE')}</p>
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs leading-relaxed mb-3">{pkg.kernpositionering}</p>
                  <div className="flex flex-wrap gap-1">
                    {pkg.tags.map((t) => (
                      <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Micro-diensten */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
            Losse micro-diensten
            {recommendedMicros.length > 0 && (
              <span className="ml-2 text-brand-gold normal-case font-normal">★ = aanbevolen op basis van uw scan</span>
            )}
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MICRO_SERVICES.map((svc) => {
              const isSelected = selectedMicros.has(svc.id);
              const isRec = recommendedMicros.includes(svc.id);
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => toggleMicro(svc.id)}
                  className={clsx(
                    'text-left p-4 rounded-lg border-2 transition-all duration-200',
                    isSelected ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-100 hover:border-brand-gold/40',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      isSelected ? 'border-brand-gold bg-brand-gold' : 'border-gray-300',
                    )}>
                      {isSelected && <span className="text-brand-dark text-[9px] font-bold">✓</span>}
                    </div>
                    <h4 className="font-semibold text-gray-900 text-xs flex-1">{svc.name}</h4>
                    {isRec && <span className="text-brand-gold text-[10px] font-bold shrink-0">★</span>}
                  </div>
                  <p className="text-brand-gold font-bold text-xs mb-1 pl-6">€{svc.price.toLocaleString('nl-BE')}</p>
                  <p className="text-gray-500 text-[11px] leading-relaxed pl-6">{svc.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Aanvullende opmerking */}
        <div>
          <label className="label" htmlFor="message">Aanvullende opmerking (optioneel)</label>
          <textarea
            id="message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Bijv. beschikbaarheid, specifieke wensen, budget…"
            className="input resize-none"
          />
        </div>

        {/* Summary + submit */}
        <div className="bg-brand-off-white rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-gray-500 mb-1">Geselecteerd</p>
            <p className="text-sm font-semibold text-gray-800">
              {allSelected.length > 0
                ? allSelected.map((id) => SERVICES.find((s) => s.id === id)?.name).filter(Boolean).join(' · ')
                : 'Nog niets geselecteerd'}
            </p>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Aanvraag verzenden…' : 'Offerte aanvragen →'}
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </section>
  );
}
