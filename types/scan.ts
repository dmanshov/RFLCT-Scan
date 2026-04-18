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
  statistics: ScoreIndicator;
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
    description: 'Volledige professionele presentatie van uw woning: fotoreportage, 2D & 3D grondplannen, advertentietekst en EPC-visualisatie.',
    tags: ['Fotoreportage', '2D & 3D Grondplan', 'Advertentietekst', 'EPC-visualisatie'],
  },
  {
    id: 'basis',
    category: 'package',
    name: 'Basis Pakket',
    description: 'Professionele fotoreportage (8 foto\'s) en een herschreven advertentietekst om uw presentatie snel te verbeteren.',
    tags: ['Fotoreportage (8 foto\'s)', 'Advertentietekst'],
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
    name: 'Fotorenovatie',
    description: 'Professionele nabewerking van uw bestaande foto\'s: belichting, witbalans en perspectief gecorrigeerd.',
    tags: ['Belichting', 'Kleurcorrectie', 'Perspectief'],
  },
  {
    id: 'micro-plan2d',
    category: 'micro',
    name: 'Grondplan 2D',
    description: 'Professioneel opgemeten en getekend 2D-grondplan conform vastgoedstandaarden.',
    tags: ['2D Grondplan', 'Schaal', 'Oriëntatie'],
  },
  {
    id: 'micro-plan3d',
    category: 'micro',
    name: 'Grondplan 3D',
    description: 'Fotorealistisch 3D-grondplan dat kopers helpt de ruimte te visualiseren.',
    tags: ['3D Visualisatie', 'Fotorealistisch'],
  },
  {
    id: 'micro-tekst',
    category: 'micro',
    name: 'Advertentietekst',
    description: 'Professioneel geschreven advertentietekst die overtuigt en converteert.',
    tags: ['Copywriting', 'SEO-geoptimaliseerd'],
  },
  {
    id: 'micro-epc',
    category: 'micro',
    name: 'EPC-visualisatie',
    description: 'Duidelijke grafische weergave van uw EPC-label conform VEKA-regelgeving.',
    tags: ['VEKA-conform', 'Grafisch', 'Transparant'],
  },
];
