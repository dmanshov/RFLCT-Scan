import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RFLCT · Advertentie-scan',
  description:
    'Gratis online scan van uw Immoweb-advertentie. Ontdek verbeterpunten en boost uw verkoopkansen.',
  openGraph: {
    title: 'RFLCT · Advertentie-scan',
    description: 'Gratis scan van uw Immoweb-advertentie',
    siteName: 'RFLCT',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
