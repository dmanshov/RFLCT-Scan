export type ScanStatus = 'pending' | 'scraping' | 'analyzing' | 'scoring' | 'done' | 'error';

export type Recommendation = 'PRODUCTIE' | 'BASIS' | 'ONLINE' | 'MICRO' | 'PERFECT';

export interface ImmowebListing {
  id: string;
  url: string;
  title: string;
  description: string;
  price: number | null;
  propertyType: string;
  city: string;
  postalCode: string;
  photos: string[];
  floorPlans: string[];
  epcScore: number | null;
  epcLabel: string | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionYear: number | null;
  agencyName: string | null;
  agencyPhone: string | null;
  agencyEmail: string | null;
  stats: {
    daysOnline: number | null;
    views: number | null;
    saves: number | null;
  };
  compliance: {
    hasRenovationObligation: boolean;
    hasAsbestosInfo: boolean;
    hasEpcLabel: boolean;
    hasFloodRisk: boolean;
  };
}

export interface ScoreIndicator {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  percentage: number;
  issues: string[];
  strengths: string[];
  verdict: 'good' | 'average' | 'poor';
}

export interface ScoreBreakdown {
  photoCount: ScoreIndicator;
  photoQuality: ScoreIndicator;
  floorPlans: ScoreIndicator;
  epcCompliance: ScoreIndicator;
  listingText: ScoreIndicator;
  photoSequence: ScoreIndicator;
  mandatoryInfo: ScoreIndicator;
  contactInfo: ScoreIndicator;
}

export interface ScanRecord {
  id: string;
  createdAt: string;
  status: ScanStatus;
  statusMessage: string;
  url: string;
  email: string;
  phone?: string;
  listing?: ImmowebListing;
  scores?: ScoreBreakdown;
  totalScore?: number;
  recommendation?: Recommendation;
  workPoints?: string[];
  pdfSent?: boolean;
  error?: string;
}

export interface ServiceOption {
  id: string;
  category: 'package' | 'micro';
  name: string;
  description: string;
  tags: string[];
  recommended?: boolean;
}

export const SERVICES: ServiceOption[] = [
  {
    id: 'productie',
    category: 'package',
    name: 'Productie Pakket',
    description: 'Volledige professionele presentatie van uw woning: fotoreportage, isometrisch 3D-grondplan, advertentietekst en EPC-visualisatie.',
    tags: ['Fotoreportage', '3D Grondplan', 'Advertentietekst', 'EPC-visualisatie'],
  },
  {
    id: 'basis',
    category: 'package',
    name: 'Basis Pakket',
    description: 'Professionele fotoreportage en een herschreven advertentietekst om uw presentatie snel te verbeteren.',
    tags: ['Fotoreportage', 'Advertentietekst'],
  },
  {
    id: 'online',
    category: 'package',
    name: 'Online Pakket',
    description: 'Optimaliseer uw online zichtbaarheid via gerichte publicatie-aanpak en sociale media promotie.',
    tags: ['Publicatie-optimalisatie', 'Social media promotie'],
  },
  {
    id: 'micro-foto',
    category: 'micro',
    name: 'Digitale foto retouche',
    description: 'Professionele nabewerking van max. 15 bestaande foto\'s: belichting, witbalans en perspectief gecorrigeerd.',
    tags: ['Max. 15 beelden', 'Belichting', 'Kleurcorrectie'],
  },
  {
    id: 'micro-plan3d',
    category: 'micro',
    name: 'Isometrisch 3D-grondplan',
    description: 'Fotorealistisch isometrisch 3D-grondplan dat kopers helpt de ruimte te visualiseren.',
    tags: ['3D Visualisatie', 'Isometrisch'],
  },
  {
    id: 'micro-styling',
    category: 'micro',
    name: 'Virtual styling / 3D-inrichting',
    description: 'Virtuele 3D-inrichting per ruimte — ideaal om lege of verouderde ruimtes aantrekkelijk voor te stellen.',
    tags: ['Per ruimte', 'Virtual staging'],
  },
  {
    id: 'micro-webpagina',
    category: 'micro',
    name: 'Persoonlijke RFLCT-webpagina',
    description: 'Een eigen landingspagina voor uw woning op het RFLCT-platform, los van Immoweb.',
    tags: ['Eigen pagina', 'RFLCT-platform'],
  },
  {
    id: 'micro-social',
    category: 'micro',
    name: 'Social-media-vermelding',
    description: 'Professionele post + reel van uw woning op onze sociale media kanalen.',
    tags: ['Post + Reel', 'Social media'],
  },
  {
    id: 'micro-meta',
    category: 'micro',
    name: 'Meta-advertentiecampagne',
    description: '1 week gerichte Meta-advertentiecampagne (Facebook/Instagram), excl. mediabudget.',
    tags: ['1 week', 'Facebook & Instagram'],
  },
  {
    id: 'micro-premium',
    category: 'micro',
    name: 'Premium Immoweb (1 maand)',
    description: 'Upgrade van uw advertentie naar Premium-zichtbaarheid op Immoweb gedurende 1 maand, zonder coaching.',
    tags: ['1 maand', 'Premium zichtbaarheid'],
  },
  {
    id: 'micro-verlenging',
    category: 'micro',
    name: 'Verlenging advertenties (1 maand)',
    description: 'Verlenging van uw bestaande advertenties op alle platformen met 1 extra maand.',
    tags: ['1 maand verlenging'],
  },
  {
    id: 'micro-gevelbord',
    category: 'micro',
    name: 'Gevelbord',
    description: 'Professioneel RFLCT-gevelbord op maat, geplaatst voor uw woning.',
    tags: ['Ter plaatse', 'Zichtbaarheid'],
  },
];
