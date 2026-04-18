import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-brand-dark">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          {/* Wordmark — replace with <Image> once the real logo SVG is available */}
          <span className="text-brand-gold font-bold text-xl tracking-[0.15em] uppercase">RFLCT</span>
          <span className="hidden sm:block text-white/30 text-xs">|</span>
          <span className="hidden sm:block text-white/60 text-xs tracking-widest uppercase">Advertentie-scan</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-white/60">
          <a href="https://www.rflct.be" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
            Terug naar rflct.be
          </a>
        </nav>
      </div>
    </header>
  );
}
