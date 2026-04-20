export type ScanStatus = 'pending' | 'scraping' | 'analyzing' | 'scoring' | 'done' | 'error';

// RFLCT Online | Productie | Basis | Compleet | MICRO = losse micro-dienst(en), geen pakket
export type Recommendation = 'ONLINE' | 'PRODUCTIE' | 'BASIS' | 'COMPLEET' | 'MICRO';
export type Verdict = 'good' | 'average' | 'poor';

// ─── Listing ───────────────────────────────────────────────────────────────
export interface ImmowebListing {
  id: string;
  url: string;
  title: string;
  description: string;
  price: number | null;
  propertyType: string;
  street: string | null;
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
  stats: { daysOnline: number | null; views: number | null; saves: number | null };
  compliance: {
    hasRenovationObligation: boolean;
    hasAsbestosInfo: boolean;
    hasEpcLabel: boolean;
    hasFloodRisk: boolean;
  };
}

// ─── Score structure ───────────────────────────────────────────────────────
export interface SubScore {
  key: string;
  label: string;
  score: number;      // punten behaald (op rawMax-schaal)
  maxScore: number;   // raw gewicht per spec
  notApplicable: boolean;
  naReason?: string;
  issues: string[];
  strengths: string[];
}

export interface DimensionScore {
  key: string;       // 'dim1' … 'dim5'
  label: string;
  score: number;     // behaald op dimMax-schaal (na dynamische weging)
  maxScore: number;  // dimensie-totaal: 35/15/20/20/10
  percentage: number;
  verdict: Verdict;
  subScores: SubScore[];
}

export interface ScoreBreakdown {
  dim1: DimensionScore;  // Visuele presentatie (35)
  dim2: DimensionScore;  // Ruimtelijk inzicht (15)
  dim3: DimensionScore;  // Advertentietekst (20)
  dim4: DimensionScore;  // Wettelijk verplichte vermeldingen (20)
  dim5: DimensionScore;  // Contact & conversie (10)
}

// ─── Report content ────────────────────────────────────────────────────────
export interface KernBevinding {
  wat: string;
  impact: string;
  strategischeLezing: string;
}

// ─── Scan record ───────────────────────────────────────────────────────────
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
  recommendationWhy?: string;
  recommendedMicros?: string[];  // max 3 micro-service ids
  kernbevindingen?: KernBevinding[];
  interpretatieText?: string;
  workPoints?: string[];  // voor e-mail backward compat
  pdfSent?: boolean;
  error?: string;
}

// ─── Services ──────────────────────────────────────────────────────────────
export interface Package {
  id: 'online' | 'productie' | 'basis' | 'compleet';
  name: string;   // exacte naam: "RFLCT Online" etc.
  price: number;
  kernpositionering: string;
  tags: string[];
}

export interface MicroService {
  id: string;
  name: string;
  price: number;
  description: string;
}

export const PACKAGES: Package[] = [
  {
    id: 'online',
    name: 'RFLCT Online',
    price: 395,
    kernpositionering: 'Boost je zichtbaarheid. AI-retouche van bestaande foto\'s + RFLCT-webpagina + social + Meta-campagne 7d. Geen coaching, geen fotograaf, geen Immoweb-publicatie.',
    tags: ['AI-fotoretouche', 'RFLCT-webpagina', 'Social media', 'Meta-campagne 7d'],
  },
  {
    id: 'productie',
    name: 'RFLCT Productie',
    price: 1495,
    kernpositionering: 'Professionele presentatie, zelf aan het roer. Professionele fotografie + virtual staging + 2D-grondplan + RFLCT-webpagina + Premium Immoweb 1m + social + Meta 7d. Geen coaching.',
    tags: ['Professionele fotografie', 'Virtual staging', '2D-grondplan', 'Premium Immoweb 1m'],
  },
  {
    id: 'basis',
    name: 'RFLCT Basis',
    price: 2850,
    kernpositionering: 'Begeleiding waar het nodig is. Persoonlijke coach tot lancering: intake, verkoopplan, prijsadvies, attestbegeleiding, professionele fotografie, virtual staging, grondplannen, Premium Immoweb 1m, social, webpagina, gevelbord.',
    tags: ['Persoonlijke coach', 'Professionele fotografie', 'Virtual staging', 'grondplannen'],
  },
  {
    id: 'compleet',
    name: 'RFLCT Compleet',
    price: 3650,
    kernpositionering: 'Van strategie tot bod. Alles uit Basis + verkoopdossier + bezoekvoorbereiding + bodanalyse + verlenging advertenties.',
    tags: ['Alles uit Basis', 'Verkoopdossier', 'Bezoekvoorbereiding', 'Bodanalyse'],
  },
];

export const MICRO_SERVICES: MicroService[] = [
  {
    id: 'ai-retouche',
    name: 'AI-fotoretouche (max. 15 beelden)',
    price: 149,
    description: 'Professionele nabewerking van max. 15 beelden: belichting, witbalans en perspectief gecorrigeerd. Enkel cosmetische correctie — geen meubels toegevoegd of gebreken gemaskeerd.',
  },
  {
    id: 'grondplannen',
    name: 'Grondplannen (2D + optioneel 3D)',
    price: 199,
    description: '2D-grondplan per verdieping op basis van uw schets of bouwplannen; optionele upgrade naar isometrisch 3D-plan voor maximaal inlevingsvermogen.',
  },
  {
    id: 'virtual-styling',
    name: 'Virtual styling / 3D-inrichting per ruimte',
    price: 195,
    description: 'Virtuele 3D-inrichting van lege of gedateerde ruimtes voor aantrekkelijkere foto\'s.',
  },
  {
    id: 'webpagina',
    name: 'Persoonlijke RFLCT-webpagina (los)',
    price: 395,
    description: 'Eigen landingspagina voor jouw woning op het RFLCT-platform, deelbaar buiten Immoweb.',
  },
  {
    id: 'social',
    name: 'Social-media-vermelding (post + reel)',
    price: 145,
    description: 'Professionele post + reel van jouw woning op onze sociale media kanalen.',
  },
  {
    id: 'meta',
    name: 'Meta-advertentiecampagne (1 week)',
    price: 195,
    description: 'Gerichte Facebook/Instagram-campagne van 1 week, exclusief mediabudget.',
  },
  {
    id: 'premium-immoweb',
    name: 'Premium Immoweb 1 maand (zonder coaching)',
    price: 395,
    description: 'Upgrade naar Premium-zichtbaarheid op Immoweb gedurende 1 maand.',
  },
  {
    id: 'verlenging',
    name: 'Verlenging advertenties (1 maand)',
    price: 295,
    description: 'Verlenging van bestaande advertenties op alle platformen met 1 extra maand.',
  },
  {
    id: 'gevelbord',
    name: 'Gevelbord',
    price: 95,
    description: 'Professioneel RFLCT-gevelbord geplaatst aan jouw woning voor lokale zichtbaarheid.',
  },
];

// Backward compat alias — te verwijderen na volledige migratie UI
export type ServiceOption = Package | MicroService;
export const SERVICES: ServiceOption[] = [...PACKAGES, ...MICRO_SERVICES];
