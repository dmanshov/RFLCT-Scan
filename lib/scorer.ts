import type { ImmowebListing, ScoreBreakdown, ScoreIndicator, Recommendation } from '@/types/scan';
import type { PhotoAnalysisResult, TextAnalysisResult, SequenceAnalysisResult } from './analyzer';

function makeIndicator(
  key: string,
  label: string,
  score: number,
  maxScore: number,
  issues: string[],
  strengths: string[],
): ScoreIndicator {
  const pct = Math.round((score / maxScore) * 100);
  return {
    key,
    label,
    score: Math.round(score),
    maxScore,
    percentage: pct,
    issues,
    strengths,
    verdict: pct >= 70 ? 'good' : pct >= 40 ? 'average' : 'poor',
  };
}

export interface ScoringInput {
  listing: ImmowebListing;
  photoAnalysis: PhotoAnalysisResult;
  textAnalysis: TextAnalysisResult;
  sequenceAnalysis: SequenceAnalysisResult;
}

export function calculateScores(input: ScoringInput): { breakdown: ScoreBreakdown; total: number } {
  const { listing, photoAnalysis, textAnalysis, sequenceAnalysis } = input;

  // 1. Foto aantal (10 pts)
  const photoCount = listing.photos.length;
  const photoCountScore =
    photoCount === 0 ? 0
    : photoCount < 5 ? 2
    : photoCount < 10 ? 5
    : photoCount < 15 ? 8
    : 10;
  const photoCountIndicator = makeIndicator(
    'photoCount',
    'Aantal foto\'s',
    photoCountScore,
    10,
    photoCount < 15
      ? [`Slechts ${photoCount} foto('s) aanwezig — minimum 15 aanbevolen.`]
      : [],
    photoCount >= 15 ? [`${photoCount} foto's — uitstekend aanbod.`] : [],
  );

  // 2. Foto kwaliteit (20 pts) — schaal AI output 0-100 naar 0-20
  const photoQualityRaw = photoAnalysis.overallScore / 5; // 0-20
  const photoQualityIndicator = makeIndicator(
    'photoQuality',
    'Fotokwaliteit',
    photoQualityRaw,
    20,
    photoAnalysis.issues,
    photoAnalysis.strengths,
  );

  // 3. Grondplannen (10 pts)
  const has2D = listing.floorPlans.length > 0;
  // Heuristic: if > 1 floor plan image assume 3D might be present
  const has3D = listing.floorPlans.length > 1;
  const floorPlanScore = has2D ? (has3D ? 10 : 5) : 0;
  const floorPlanIndicator = makeIndicator(
    'floorPlans',
    'Grondplannen',
    floorPlanScore,
    10,
    !has2D ? ['Geen grondplan gevonden. 2D én 3D grondplan verhoogt koopervaringen sterk.']
    : !has3D ? ['Enkel 2D grondplan aanwezig. Een 3D-versie geeft kopers beter ruimtegefoel.']
    : [],
    has3D ? ['2D én 3D grondplan aanwezig — maximale transparantie.']
    : has2D ? ['2D grondplan aanwezig.']
    : [],
  );

  // 4. EPC conformiteit (10 pts) — VEKA regelgeving
  const hasEpcLabel = listing.compliance.hasEpcLabel && !!listing.epcLabel;
  const hasEpcScore = listing.epcScore !== null;
  const epcScore = (hasEpcLabel ? 5 : 0) + (hasEpcScore ? 5 : 0);
  const epcIndicator = makeIndicator(
    'epcCompliance',
    'EPC-conformiteit',
    epcScore,
    10,
    [
      ...(!hasEpcLabel ? ['EPC-label (A++→G) niet zichtbaar in de advertentie — verplicht conform VEKA.'] : []),
      ...(!hasEpcScore ? ['EPC-kengetal (kWh/m²/jaar) ontbreekt — verplicht conform VEKA.'] : []),
    ],
    [
      ...(hasEpcLabel ? [`EPC-label ${listing.epcLabel} duidelijk vermeld.`] : []),
      ...(hasEpcScore ? [`EPC-kengetal ${listing.epcScore} kWh/m²/jaar aanwezig.`] : []),
    ],
  );

  // 5. Advertentietekst (15 pts) — schaal 0-100 naar 0-15
  const textScore = (textAnalysis.score / 100) * 15;
  const textIndicator = makeIndicator(
    'listingText',
    'Advertentietekst',
    textScore,
    15,
    textAnalysis.issues,
    textAnalysis.strengths,
  );

  // 6. Foto volgorde (10 pts) — schaal 0-100 naar 0-10
  const seqScore = (sequenceAnalysis.score / 100) * 10;
  const seqIndicator = makeIndicator(
    'photoSequence',
    'Volgorde van beelden',
    seqScore,
    10,
    sequenceAnalysis.issues,
    sequenceAnalysis.logicalFlow ? ['Logische doorloop van de woning.'] : [],
  );

  // 7. Verplichte info (15 pts)
  const year = listing.constructionYear ?? 2005;
  const epcClass = listing.epcLabel ?? '';
  const needsRenovation = year < 2000 && ['D', 'E', 'F', 'G'].some((c) => epcClass.toUpperCase().startsWith(c));
  const needsAsbestos = year < 2001;

  const renovScore = listing.compliance.hasRenovationObligation || !needsRenovation ? 5 : 0;
  const asbestScore = listing.compliance.hasAsbestosInfo || !needsAsbestos ? 5 : 0;
  const floodScore = listing.compliance.hasFloodRisk ? 5 : 0;
  const mandatoryScore = renovScore + asbestScore + floodScore;

  const mandatoryIssues: string[] = [];
  const mandatoryStrengths: string[] = [];
  if (!listing.compliance.hasRenovationObligation && needsRenovation) {
    mandatoryIssues.push('Renovatieplicht niet vermeld — verplicht bij verkoop van woningen met EPC D–G die vóór 2000 gebouwd zijn.');
  } else {
    mandatoryStrengths.push('Renovatieplicht correct behandeld.');
  }
  if (!listing.compliance.hasAsbestosInfo && needsAsbestos) {
    mandatoryIssues.push('Asbestattest niet vermeld — verplicht bij verkoop van woningen gebouwd vóór 2001.');
  } else {
    mandatoryStrengths.push('Asbestattest-vermelding aanwezig.');
  }
  if (!listing.compliance.hasFloodRisk) {
    mandatoryIssues.push('Overstromingsgevoeligheid (P- en G-score) niet vermeld — verplicht conform Vlaamse regelgeving.');
  } else {
    mandatoryStrengths.push('Overstromingsrisico duidelijk vermeld.');
  }

  const mandatoryIndicator = makeIndicator(
    'mandatoryInfo',
    'Verplichte informatie',
    mandatoryScore,
    15,
    mandatoryIssues,
    mandatoryStrengths,
  );

  // 8. Contactgegevens (5 pts)
  const hasName = !!listing.agencyName;
  const hasPhone = !!listing.agencyPhone;
  const hasEmail = !!listing.agencyEmail;
  const contactScore = (hasName ? 1 : 0) + (hasPhone ? 2 : 0) + (hasEmail ? 2 : 0);
  const contactIndicator = makeIndicator(
    'contactInfo',
    'Contactgegevens',
    contactScore,
    5,
    [
      ...(!hasPhone ? ['Geen telefoonnummer zichtbaar in de advertentie.'] : []),
      ...(!hasEmail ? ['Geen e-mailadres zichtbaar in de advertentie.'] : []),
    ],
    [...(hasPhone && hasEmail ? ['Volledige contactgegevens aanwezig.'] : [])],
  );

  // 9. Statistieken & impact (5 pts)
  const { views, saves, daysOnline } = listing.stats;
  let statsScore = 0;
  const statsIssues: string[] = [];
  const statsStrengths: string[] = [];

  if (views !== null || saves !== null || daysOnline !== null) {
    statsScore += 1; // Data available
    if (daysOnline !== null && daysOnline > 30 && (views === null || views < 100)) {
      statsIssues.push(`Advertentie is al ${daysOnline} dagen online maar genereert weinig zichtbaarheid.`);
    }
    if (saves !== null && views !== null && views > 0) {
      const saveRate = saves / views;
      if (saveRate > 0.05) {
        statsScore += 2;
        statsStrengths.push(`Hoge bewaarrate (${Math.round(saveRate * 100)}%) wijst op grote interesse.`);
      } else {
        statsIssues.push('Lage bewaarrate in verhouding tot het aantal views — presentatie trekt onvoldoende aan.');
      }
    }
    if (daysOnline !== null && daysOnline <= 14) {
      statsScore += 2;
      statsStrengths.push(`Advertentie is relatief recent (${daysOnline} dagen online).`);
    }
  } else {
    statsIssues.push('Statistieken (views, bewaringen) niet publiek zichtbaar — deze zijn enkel voor de eigenaar beschikbaar.');
  }

  const statsIndicator = makeIndicator(
    'statistics',
    'Statistieken & impact',
    Math.min(statsScore, 5),
    5,
    statsIssues,
    statsStrengths,
  );

  const breakdown: ScoreBreakdown = {
    photoCount: photoCountIndicator,
    photoQuality: photoQualityIndicator,
    floorPlans: floorPlanIndicator,
    epcCompliance: epcIndicator,
    listingText: textIndicator,
    photoSequence: seqIndicator,
    mandatoryInfo: mandatoryIndicator,
    contactInfo: contactIndicator,
    statistics: statsIndicator,
  };

  const total = Math.round(
    Object.values(breakdown).reduce((sum, ind) => sum + ind.score, 0),
  );

  return { breakdown, total };
}

export function deriveRecommendation(
  total: number,
  breakdown: ScoreBreakdown,
  listing: ImmowebListing,
): Recommendation {
  const hasFloorPlan = listing.floorPlans.length > 0;
  const weakPhotos = breakdown.photoQuality.percentage < 40;
  const poorText = breakdown.listingText.percentage < 40;

  if (total < 50 && !hasFloorPlan) return 'PRODUCTIE';
  if (total < 50) return 'BASIS';
  if (total <= 70 && (weakPhotos || poorText)) return 'MICRO';
  if (total > 70 && total <= 85) return 'ONLINE';
  return 'PERFECT';
}

export function buildWorkPoints(breakdown: ScoreBreakdown): string[] {
  const points: string[] = [];
  for (const ind of Object.values(breakdown)) {
    for (const issue of ind.issues) {
      points.push(issue);
    }
  }
  return points;
}
