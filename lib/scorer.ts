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

  // 1. Foto aantal (15 pts)
  const photoCount = listing.photos.length;
  const photoCountScore =
    photoCount === 0 ? 0
    : photoCount < 8 ? 6
    : photoCount < 15 ? 10
    : photoCount < 20 ? 13
    : 15;
  const photoCountIndicator = makeIndicator(
    'photoCount',
    "Aantal foto's",
    photoCountScore,
    15,
    photoCount < 8 ? [`Slechts ${photoCount} foto('s) gevonden — minimum 15 à 20 aanbevolen voor een sterke presentatie.`] : [],
    photoCount >= 20 ? [`${photoCount} foto's aanwezig — uitstekend.`]
    : photoCount >= 15 ? [`${photoCount} foto's aanwezig — goed.`] : [],
  );

  // 2. Foto kwaliteit (20 pts) — schaal AI output 0-100 naar 0-20
  const photoQualityRaw = photoCount === 0 ? 0 : (photoAnalysis.overallScore / 100) * 20;
  const photoQualityIndicator = makeIndicator(
    'photoQuality',
    'Fotokwaliteit',
    photoQualityRaw,
    20,
    photoAnalysis.issues,
    photoAnalysis.strengths,
  );

  // 3. Grondplannen (10 pts) — enkel 3D
  const has3D = listing.floorPlans.length > 0;
  const floorPlanScore = has3D ? 10 : 0;
  const floorPlanIndicator = makeIndicator(
    'floorPlans',
    'Grondplannen',
    floorPlanScore,
    10,
    !has3D ? ['Geen 3D-grondplan gevonden. Een isometrisch 3D-grondplan helpt kopers de ruimte beter te visualiseren.'] : [],
    has3D ? ['3D-grondplan aanwezig — maximale transparantie voor de koper.'] : [],
  );

  // 4. EPC (10 pts)
  const hasEpcLabel = listing.compliance.hasEpcLabel || !!listing.epcLabel;
  const hasEpcScore = listing.epcScore !== null;
  const epcScore = hasEpcLabel ? (hasEpcScore ? 10 : 7) : 0;
  const epcIndicator = makeIndicator(
    'epcCompliance',
    'EPC-informatie',
    epcScore,
    10,
    !hasEpcLabel ? ['EPC-label niet teruggevonden in de advertentie — verplicht te vermelden conform VEKA-regelgeving.'] : [],
    [
      ...(hasEpcLabel ? [`EPC-label${listing.epcLabel ? ` ${listing.epcLabel}` : ''} vermeld.`] : []),
      ...(hasEpcScore ? [`EPC-kengetal ${listing.epcScore} kWh/m²/jaar aanwezig.`] : []),
    ],
  );

  // 5. Advertentietekst (20 pts) — schaal 0-100 naar 0-20
  const textScore = (textAnalysis.score / 100) * 20;
  const textIndicator = makeIndicator(
    'listingText',
    'Advertentietekst',
    textScore,
    20,
    textAnalysis.issues,
    textAnalysis.strengths,
  );

  // 6. Foto volgorde (10 pts) — schaal 0-100 naar 0-10
  const seqScore = photoCount < 3 ? 6 : (sequenceAnalysis.score / 100) * 10;
  const seqIndicator = makeIndicator(
    'photoSequence',
    'Volgorde van beelden',
    seqScore,
    10,
    photoCount >= 3 ? sequenceAnalysis.issues : [],
    photoCount >= 3 && sequenceAnalysis.logicalFlow ? ['Logische doorloop van de woning aangehouden.'] : [],
  );

  // 7. Verplichte info (15 pts)
  const needsAsbestos = true; // err on side of caution — most listings should mention it
  const renovScore = listing.compliance.hasRenovationObligation ? 5 : 3;
  const asbestScore = listing.compliance.hasAsbestosInfo ? 5 : (needsAsbestos ? 0 : 5);
  const floodScore = listing.compliance.hasFloodRisk ? 5 : 0;
  const mandatoryScore = renovScore + asbestScore + floodScore;

  const mandatoryIssues: string[] = [];
  const mandatoryStrengths: string[] = [];
  if (!listing.compliance.hasRenovationObligation) {
    mandatoryIssues.push('Renovatieplicht niet expliciet vermeld — controleer of dit van toepassing is en vermeld dit duidelijk.');
  } else {
    mandatoryStrengths.push('Renovatieplicht correct behandeld.');
  }
  if (!listing.compliance.hasAsbestosInfo) {
    mandatoryIssues.push('Asbestattest niet vermeld — verplicht bij verkoop van woningen gebouwd vóór 2001.');
  } else {
    mandatoryStrengths.push('Asbestattest vermeld.');
  }
  if (!listing.compliance.hasFloodRisk) {
    mandatoryIssues.push('Overstromingsgevoeligheid (P- en G-score) niet teruggevonden — verplicht conform Vlaamse regelgeving.');
  } else {
    mandatoryStrengths.push('Overstromingsrisico vermeld.');
  }

  const mandatoryIndicator = makeIndicator(
    'mandatoryInfo',
    'Verplichte informatie',
    mandatoryScore,
    15,
    mandatoryIssues,
    mandatoryStrengths,
  );

  // 8. Contactgegevens (10 pts)
  const hasName = !!listing.agencyName;
  const hasPhone = !!listing.agencyPhone;
  const hasEmail = !!listing.agencyEmail;
  const contactScore = hasName && hasPhone && hasEmail ? 10
    : hasPhone || hasEmail ? 6
    : 4; // Immoweb always shows contact via platform — neutral score if we can't detect
  const contactIndicator = makeIndicator(
    'contactInfo',
    'Contactgegevens',
    contactScore,
    10,
    (!hasPhone && !hasEmail) ? ['Contactgegevens niet rechtstreeks zichtbaar in de advertentietekst.'] : [],
    (hasPhone && hasEmail) ? ['Volledige contactgegevens aanwezig.'] : [],
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
  };

  const total = Math.min(
    100,
    Math.round(Object.values(breakdown).reduce((sum, ind) => sum + ind.score, 0)),
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
