export default function Footer() {
  return (
    <footer className="bg-brand-dark mt-24">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
        <span>© {new Date().getFullYear()} RFLCT · Professionele vastgoedpresentatie</span>
        <div className="flex gap-6">
          <a href="https://www.rflct.be" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">
            www.rflct.be
          </a>
          <a href="mailto:info@rflct.be" className="hover:text-white/70 transition-colors">
            info@rflct.be
          </a>
        </div>
      </div>
    </footer>
  );
}
