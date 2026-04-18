'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { SERVICES } from '@/types/scan';
import type { Recommendation } from '@/types/scan';

interface Props {
  recommendation: Recommendation;
  scanId: string;
  totalScore: number;
}

const REC_DEFAULTS: Record<Recommendation, string[]> = {
  PRODUCTIE: ['productie'],
  BASIS: ['basis'],
  ONLINE: ['online'],
  MICRO: ['micro-foto', 'micro-tekst'],
  PERFECT: [],
};

const REC_HEADLINE: Record<Recommendation, { title: string; body: string }> = {
  PRODUCTIE: {
    title: 'Productie Pakket aanbevolen',
    body: 'Uw advertentie mist essentiële elementen. Een volledige productieopdracht brengt uw presentatie direct naar het hoogste niveau en verkortt de verkooptijd.',
  },
  BASIS: {
    title: 'Basis Pakket aanbevolen',
    body: 'Met gerichte verbeteringen aan foto\'s en tekst pakt u de voornaamste zwakke punten aan zonder grote investering.',
  },
  ONLINE: {
    title: 'Online Pakket aanbevolen',
    body: 'Uw presentatie is al kwalitatief. Extra online zichtbaarheid en gerichte promotie vergroten uw bereik en verkorten de verkooptijd.',
  },
  MICRO: {
    title: 'Gerichte micro-diensten aanbevolen',
    body: 'Selecteer de specifieke diensten die de gedetecteerde zwakke punten aanpakken en til uw advertentie naar een hoger niveau.',
  },
  PERFECT: {
    title: 'Uw advertentie scoort uitstekend',
    body: 'Proficiat! Uw presentatie is professioneel en volledig. Wenst u toch verdere ondersteuning? Neem vrijblijvend contact op.',
  },
};

export default function RecommendationShop({ recommendation, scanId, totalScore }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(REC_DEFAULTS[recommendation]));
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const { title, body } = REC_HEADLINE[recommendation];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Selecteer minstens één dienst om een offerte aan te vragen.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, selectedServices: [...selected], message }),
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

  const packages = SERVICES.filter((s) => s.category === 'package');
  const micros = SERVICES.filter((s) => s.category === 'micro');

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
      {/* Recommendation header */}
      <div className="bg-brand-dark rounded-xl p-8">
        <p className="text-brand-gold text-xs font-bold uppercase tracking-widest mb-2">Onze aanbeveling</p>
        <h2 className="text-white font-bold text-2xl mb-3">{title}</h2>
        <p className="text-white/70 text-sm leading-relaxed max-w-2xl">{body}</p>
      </div>

      <form onSubmit={submit} className="space-y-8">
        {/* Packages */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Pakketten</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {packages.map((svc) => {
              const isSelected = selected.has(svc.id);
              const isRec = REC_DEFAULTS[recommendation].includes(svc.id);
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => toggle(svc.id)}
                  className={clsx(
                    'text-left p-5 rounded-lg border-2 transition-all duration-200 relative',
                    isSelected
                      ? 'border-brand-gold bg-brand-gold/5'
                      : 'border-gray-100 hover:border-brand-gold/40',
                  )}
                >
                  {isRec && (
                    <span className="absolute top-3 right-3 bg-brand-gold text-brand-dark text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                      Aanbevolen
                    </span>
                  )}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={clsx(
                      'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      isSelected ? 'border-brand-gold bg-brand-gold' : 'border-gray-300',
                    )}>
                      {isSelected && <span className="text-brand-dark text-xs font-bold">✓</span>}
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm">{svc.name}</h4>
                  </div>
                  <p className="text-gray-500 text-xs leading-relaxed mb-3">{svc.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {svc.tags.map((t) => (
                      <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Micro services */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Losse micro-diensten</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {micros.map((svc) => {
              const isSelected = selected.has(svc.id);
              const isRec = REC_DEFAULTS[recommendation].includes(svc.id);
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => toggle(svc.id)}
                  className={clsx(
                    'text-left p-4 rounded-lg border-2 transition-all duration-200',
                    isSelected
                      ? 'border-brand-gold bg-brand-gold/5'
                      : 'border-gray-100 hover:border-brand-gold/40',
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      isSelected ? 'border-brand-gold bg-brand-gold' : 'border-gray-300',
                    )}>
                      {isSelected && <span className="text-brand-dark text-[9px] font-bold">✓</span>}
                    </div>
                    <h4 className="font-semibold text-gray-900 text-xs">{svc.name}</h4>
                    {isRec && <span className="ml-auto text-brand-gold text-[9px] font-bold">★</span>}
                  </div>
                  <p className="text-gray-500 text-[11px] leading-relaxed">{svc.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional message */}
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

        {/* Selected summary */}
        {selected.size > 0 && (
          <div className="bg-brand-off-white rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-gray-500 mb-1">Geselecteerd</p>
              <p className="text-sm font-semibold text-gray-800">
                {[...selected].map((id) => SERVICES.find((s) => s.id === id)?.name).filter(Boolean).join(' · ')}
              </p>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Aanvraag verzenden…' : 'Offerte aanvragen →'}
            </button>
          </div>
        )}

        {selected.size === 0 && (
          <button type="submit" className="btn-primary">
            Offerte aanvragen →
          </button>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </section>
  );
}
