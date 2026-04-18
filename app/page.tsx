'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const INDICATORS = [
  { icon: '📸', label: "Foto's", desc: 'Aantal, kwaliteit, belichting & kadrering' },
  { icon: '🗺️', label: 'Grondplannen', desc: '2D & 3D aanwezig en leesbaar' },
  { icon: '⚡', label: 'EPC-label', desc: 'Conform VEKA-regelgeving' },
  { icon: '✍️', label: 'Advertentietekst', desc: 'Overtuigingskracht & professionaliteit' },
  { icon: '🔄', label: 'Beeldvolgorde', desc: 'Logische doorloop van de woning' },
  { icon: '📋', label: 'Verplichte info', desc: 'Renovatieplicht, asbestattest & meer' },
  { icon: '📞', label: 'Contactgegevens', desc: 'Volledigheid & bereikbaarheid' },
  { icon: '📊', label: 'Statistieken', desc: 'Views, bewaringen & publicatieduur' },
];

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Scan wordt voorbereid…');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  // Elapsed timer for UX feedback
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLoadingMessage('Scan wordt gestart…');
    setError('');

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email, phone: phone || undefined }),
      });

      // Non-200 before stream starts = validation error
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Onbekende fout bij het starten van de scan.');
      }

      // Read Server-Sent Events stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: { type: string; message?: string; scanId?: string; scan?: unknown };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'status' && event.message) {
            setLoadingMessage(event.message);
          } else if (event.type === 'done' && event.scanId && event.scan) {
            sessionStorage.setItem(`rflct-scan-${event.scanId}`, JSON.stringify(event.scan));
            router.push(`/scan/${event.scanId}`);
            return;
          } else if (event.type === 'error' && event.message) {
            throw new Error(event.message);
          }
        }
      }

      // Stream ended without 'done' event
      throw new Error('Scan werd onderbroken. Probeer opnieuw of contacteer info@rflct.be.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is een fout opgetreden. Probeer opnieuw.');
      setLoading(false);
    }
  }

  return (
    <>
      <Header />

      {/* Hero */}
      <section className="bg-brand-dark relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 70% 40%, #C9A050 0%, transparent 60%)' }}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-24 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <p className="text-brand-gold text-xs font-bold uppercase tracking-[0.2em]">Gratis · Geen account vereist</p>
            <h1 className="text-white text-4xl lg:text-5xl font-bold leading-tight">
              Hoe sterk is uw<br />
              <span className="text-brand-gold">Immoweb-advertentie</span>?
            </h1>
            <p className="text-white/60 text-lg leading-relaxed max-w-md">
              Voer de URL in van uw lopende advertentie en ontvang binnen minuten een gedetailleerde scorekaart met verbeterpunten — rechtstreeks in uw mailbox.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              {['Score op 100 punten', 'AI-gestuurde analyse', 'PDF-rapport per e-mail'].map((feat) => (
                <span key={feat} className="flex items-center gap-1.5 text-white/70 text-sm">
                  <span className="text-brand-gold">✓</span> {feat}
                </span>
              ))}
            </div>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-xl p-8 shadow-2xl">
            {loading ? (
              <div className="py-8 text-center space-y-6">
                <svg className="animate-spin h-12 w-12 text-brand-gold mx-auto" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <div>
                  <p className="font-bold text-gray-900 text-lg mb-2">Uw advertentie wordt geanalyseerd</p>
                  <p className="text-brand-gold text-sm font-medium min-h-[1.25rem]">{loadingMessage}</p>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>{elapsed}s verstreken · doorgaans 30–90 seconden</p>
                  <p>U ontvangt ook een e-mail zodra het rapport klaar is.</p>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-bold text-gray-900 text-lg mb-1">Start uw gratis scan</h2>
                <p className="text-gray-500 text-sm mb-6">Uw rapport arriveert binnen enkele minuten in uw mailbox.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="url">Immoweb-advertentie URL *</label>
                    <input id="url" type="url" required value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.immoweb.be/nl/te-koop/..."
                      className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="email">E-mailadres *</label>
                    <input id="email" type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="uwmail@voorbeeld.be"
                      className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="phone">
                      Telefoonnummer <span className="text-gray-400 normal-case font-normal">(optioneel)</span>
                    </label>
                    <input id="phone" type="tel" value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+32 4XX XX XX XX"
                      className="input" />
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
                      {error}
                    </div>
                  )}

                  <button type="submit" className="btn-primary w-full text-base py-3.5">
                    Scan starten →
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    Door te starten gaat u akkoord met onze{' '}
                    <a href="https://www.rflct.be/privacy" className="underline hover:text-gray-600"
                      target="_blank" rel="noopener noreferrer">privacyverklaring</a>.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Indicators */}
      <section className="bg-brand-off-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-brand-gold text-xs font-bold uppercase tracking-widest mb-3">Wat analyseren we?</p>
            <h2 className="text-3xl font-bold text-gray-900">8 kwaliteitsindicatoren</h2>
            <p className="text-gray-500 mt-3 max-w-lg mx-auto">
              Onze AI evalueert uw advertentie op alle aspecten die kopers overtuigen — en die u punten kosten als ze ontbreken.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {INDICATORS.map((ind) => (
              <div key={ind.label} className="card p-6 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-3">{ind.icon}</div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{ind.label}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{ind.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-brand-gold text-xs font-bold uppercase tracking-widest mb-3">Hoe werkt het?</p>
          <h2 className="text-3xl font-bold text-gray-900">In 3 stappen naar uw rapport</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { step: '01', title: 'URL invoeren', desc: 'Plak de link van uw Immoweb-advertentie in het formulier en vul uw e-mailadres in.' },
            { step: '02', title: 'AI analyseert', desc: "Onze AI evalueert foto's, tekst, grondplannen en wettelijke vermeldingen — volledig automatisch." },
            { step: '03', title: 'Rapport ontvangen', desc: 'U ontvangt een gedetailleerd PDF-rapport met scorekaart, werkpunten en gepersonaliseerd advies.' },
          ].map((item) => (
            <div key={item.step} className="relative pl-16">
              <span className="absolute left-0 top-0 text-5xl font-black text-gray-100 leading-none select-none">{item.step}</span>
              <h3 className="font-bold text-gray-900 mb-2 relative">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed relative">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
