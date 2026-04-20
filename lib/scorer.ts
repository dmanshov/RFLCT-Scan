import type {
  ImmowebListing,
  ScoreBreakdown,
  DimensionScore,
  SubScore,
  Recommendation,
  KernBevinding,
  Verdict,
} from '@/types/scan';
import type { PhotoAnalysisResult, TextAnalysisResult } from './analyzer';

// ─── Input ────────────────────────────────────────────────────────────────

export interface ScoringInput {
  listing: ImmowebListing;
  photoAnalysis: PhotoAnalysisResult;
  textAnalysis: TextAnalysisResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function verdict(pct: number): Verdict {
  return pct >= 70 ? 'good' : pct >= 40 ? 'average' : 'poor';
}

function sub(
  key: string,
  label: string,
  score: number,
  maxScore: number,
  issues: string[],
  strengths: string[],
  notApplicable = false,
  naReason?: string,
): SubScore {
  return {
    key,
    label,
    score: Math.max(0, Math.min(maxScore, Math.round(score))),
    maxScore,
    notApplicable,
    naReason,
    issues,
    strengths,
  };
}

function buildDim(
  key: string,
  label: string,
  dimMax: number,
  subScores: SubScore[],
  dynamic = false,
): DimensionScore {
  const applicable = subScores.filter((s) => !s.notApplicable);
  const rawScore = applicable.reduce((a, s) => a + s.score, 0);
  const rawMax = applicable.reduce((a, s) => a + s.maxScore, 0);

  // Dynamic weighting: scale applicable score to full dimMax
  const scaledScore = dynamic && rawMax > 0
    ? Math.round((rawScore / rawMax) * dimMax)
    : rawScore;

  const score = Math.max(0, Math.min(dimMax, scaledScore));
  const pct = dimMax > 0 ? Math.round((score / dimMax) * 100) : 0;

  return { key, label, score, maxScore: dimMax, percentage: pct, verdict: verdict(pct), subScores };
}

// ─── Dimension builders ───────────────────────────────────────────────────

function scoreDim1(listing: ImmowebListing, photo: PhotoAnalysisResult): DimensionScore {
  const n = listing.photos.length;

  // Sub 1.1 — Aantal foto's (max 10)
  const aantalScore = n === 0 ? 0 : n < 8 ? 3 : n < 15 ? 6 : n < 20 ? 8 : 10;
  const s11 = sub('foto-aantal', "Aantal foto's", aantalScore, 10,
    n === 0 ? ["Geen foto's aanwezig."]
    : n < 8  ? [`Slechts ${n} foto's — minimum 15–20 aanbevolen.`]
    : n < 15 ? [`${n} foto's — verhoog naar 15–20 voor een optimale presentatie.`]
    : [],
    n >= 20 ? [`${n} foto's — uitstekend.`] : n >= 15 ? [`${n} foto's — goed.`] : [],
  );

  // Sub 1.2 — Fotokwaliteit (max 15) — direct van qualityTotal
  const s12 = sub('foto-kwaliteit', 'Fotokwaliteit', photo.qualityTotal, 15,
    photo.issues,
    photo.strengths,
  );

  // Sub 1.3 — Foto-volgorde (max 10) — direct van sequenceScore
  const s13 = sub('foto-volgorde', 'Foto-volgorde', photo.sequenceScore, 10,
    !photo.logicalFlow ? photo.issues.slice(0, 2) : [],
    photo.logicalFlow ? ['Logische narratieve doorloop aangehouden.'] : [],
  );

  return buildDim('dim1', 'Visuele presentatie', 35, [s11, s12, s13]);
}

function scoreDim2(listing: ImmowebListing): DimensionScore {
  const hasFloorPlan = listing.floorPlans.length > 0;

  // Sub 2.1 — 2D grondplan (max 8)
  const s21 = sub('grondplan-2d', '2D-grondplan', hasFloorPlan ? 5 : 0, 8,
    !hasFloorPlan ? ['Geen 2D-grondplan gedetecteerd — kopers kunnen de indeling niet beoordelen.'] : [],
    hasFloorPlan ? ['Grondplan aanwezig.'] : [],
  );

  // Sub 2.2 — 3D grondplan (max 7) — scraper kan dit niet onderscheiden, altijd 0
  const s22 = sub('grondplan-3d', '3D-grondplan (isometrisch)', 0, 7,
    ['3D-grondplan niet gedetecteerd — isometrisch 3D-plan verhoogt de beleving voor kandidaat-kopers.'],
    [],
  );

  return buildDim('dim2', 'Ruimtelijk inzicht', 15, [s21, s22]);
}

function scoreDim3(text: TextAnalysisResult): DimensionScore {
  // Sub 3.1 — Structuur & volledigheid (max 8) — count van 8 checklist items
  const s31 = sub('structuur-volledigheid', 'Structuur & volledigheid', text.structuurVolledigheid, 8,
    text.issues.slice(0, 2),
    text.strengths.slice(0, 1),
  );

  // Sub 3.2 — Onderscheidend karakter (max 7) — discrete: 0|3|5|7
  const clicheIssues = text.cliches.length > 0
    ? [`Clichés aangetroffen: "${text.cliches.slice(0, 2).join('", "')}"`]
    : [];
  const s32 = sub('onderscheidend-karakter', 'Onderscheidend karakter', text.onderscheidendKarakter, 7,
    text.onderscheidendKarakter < 5 ? [...clicheIssues, ...text.issues.filter(i => !s31.issues.includes(i)).slice(0, 1)] : clicheIssues,
    text.onderscheidendKarakter >= 5 ? ['Authentieke en onderscheidende schrijfstijl.'] : [],
  );

  // Sub 3.3 — Call-to-action (max 5) — discrete: 0|3|5
  const s33 = sub('call-to-action', 'Call-to-action', text.callToAction, 5,
    text.callToAction === 0 ? ['Geen call-to-action gevonden — kopers weten niet hoe ze contact kunnen opnemen.'] : [],
    text.callToAction === 5 ? ['Concrete en urgente call-to-action aanwezig.'] : [],
  );

  return buildDim('dim3', 'Advertentietekst', 20, [s31, s32, s33]);
}

function scoreDim4(listing: ImmowebListing): DimensionScore {
  const epcLabel = listing.epcLabel ?? '';
  const hasEpcLabel = listing.compliance.hasEpcLabel || !!listing.epcLabel;
  const hasEpcScore = listing.epcScore !== null;

  // Sub 4.1 — EPC-informatie (max 7)
  const epcPts = hasEpcLabel && hasEpcScore ? 7 : hasEpcLabel ? 4 : 0;
  const s41 = sub('epc-info', 'EPC-informatie', epcPts, 7,
    !hasEpcLabel
      ? ['EPC-label niet gevonden — verplicht conform VEKA-regelgeving.']
      : !hasEpcScore
      ? ['EPC-kengetal (kWh/m²/jaar) niet gevonden — beide zijn verplicht.']
      : [],
    hasEpcLabel && hasEpcScore
      ? [`EPC-label ${epcLabel} en kengetal ${listing.epcScore} kWh/m²/jaar aanwezig.`]
      : hasEpcLabel ? [`EPC-label ${epcLabel} aanwezig.`] : [],
  );

  // Sub 4.2 — Renovatieplicht (max 4)
  // N/A wanneer EPC-label A, B of C (geen renovatieplicht van toepassing)
  const renovNa = /^[ABCabc]/.test(epcLabel);
  const renovScore = listing.compliance.hasRenovationObligation ? 4 : 0;
  const s42 = sub('renovatieplicht', 'Renovatieplicht', renovNa ? 0 : renovScore, 4,
    !renovNa && !listing.compliance.hasRenovationObligation
      ? ['Renovatieplicht niet vermeld — verplicht voor panden met EPC D of lager.']
      : [],
    !renovNa && listing.compliance.hasRenovationObligation
      ? ['Renovatieplicht correct vermeld.']
      : [],
    renovNa,
    renovNa ? `EPC-label ${epcLabel}: renovatieplicht niet van toepassing.` : undefined,
  );

  // Sub 4.3 — Asbestattest (max 4)
  // N/A voor gebouwen vanaf 2001 of nieuwbouw
  const year = listing.constructionYear;
  const isNewBuild = /nieuwbouw/i.test(listing.description);
  const asbestNa = (year !== null && year >= 2001) || isNewBuild;
  const asbestScore = listing.compliance.hasAsbestosInfo ? 4 : 0;
  const s43 = sub('asbestattest', 'Asbestattest', asbestNa ? 0 : asbestScore, 4,
    !asbestNa && !listing.compliance.hasAsbestosInfo
      ? ['Asbestattest niet vermeld — verplicht voor panden gebouwd vóór 2001.']
      : [],
    !asbestNa && listing.compliance.hasAsbestosInfo
      ? ['Asbestattest vermeld.']
      : [],
    asbestNa,
    asbestNa ? (isNewBuild ? 'Nieuwbouw: asbestattest niet verplicht.' : `Bouwjaar ${year}: asbestattest niet verplicht.`) : undefined,
  );

  // Sub 4.4 — Overstromingsrisico (max 3)
  const s44 = sub('overstromingsrisico', 'Overstromingsrisico (P- & G-score)', listing.compliance.hasFloodRisk ? 3 : 0, 3,
    !listing.compliance.hasFloodRisk
      ? ['Overstromingsgevoeligheid (P- en G-score) niet vermeld — wettelijk verplicht in Vlaanderen.']
      : [],
    listing.compliance.hasFloodRisk ? ['Overstromingsrisico correct vermeld.'] : [],
  );

  // Sub 4.5 — Stedenbouwkundige info (max 2)
  const hasSteden = /stedenbouwkundig|gewestplan|rup\b|bouwvergunning|vergund/i.test(listing.description);
  const s45 = sub('stedenbouwkundig', 'Stedenbouwkundige informatie', hasSteden ? 2 : 0, 2,
    !hasSteden ? ['Geen stedenbouwkundige informatie gevonden (bestemming, vergund gebruik).'] : [],
    hasSteden ? ['Stedenbouwkundige informatie aanwezig.'] : [],
  );

  // dim4 gebruikt dynamic weighting: N/A subcriteria worden uit de noemer gehaald
  return buildDim('dim4', 'Wettelijk verplichte vermeldingen', 20, [s41, s42, s43, s44, s45], true);
}

function scoreDim5(listing: ImmowebListing): DimensionScore {
  const hasName  = !!listing.agencyName;
  const hasPhone = !!listing.agencyPhone;
  const hasEmail = !!listing.agencyEmail;

  const s51 = sub('contact-naam', 'Naam contactpersoon', hasName ? 3 : 0, 3,
    !hasName ? ['Naam van contactpersoon niet gevonden — anonimiteit verlaagt het vertrouwen bij kopers.'] : [],
    hasName ? [`Contactpersoon: ${listing.agencyName}.`] : [],
  );
  const s52 = sub('contact-telefoon', 'Telefoonnummer', hasPhone ? 4 : 0, 4,
    !hasPhone ? ['Telefoonnummer ontbreekt — kopers die liever bellen haken af.'] : [],
    hasPhone ? [`Telefoon: ${listing.agencyPhone}.`] : [],
  );
  const s53 = sub('contact-email', 'E-mailadres', hasEmail ? 3 : 0, 3,
    !hasEmail ? ['E-mailadres ontbreekt — geeft kopers het gevoel van controle bij eerste contact.'] : [],
    hasEmail ? [`E-mail: ${listing.agencyEmail}.`] : [],
  );

  return buildDim('dim5', 'Contact & conversie', 10, [s51, s52, s53]);
}

// ─── Consistency check ─────────────────────────────────────────────────────

function runConsistencyCheck(breakdown: ScoreBreakdown, total: number): void {
  const errors: string[] = [];
  const dimMax = { dim1: 35, dim2: 15, dim3: 20, dim4: 20, dim5: 10 };
  let dimSum = 0;

  for (const [key, dim] of Object.entries(breakdown) as [keyof typeof dimMax, DimensionScore][]) {
    const maxAllowed = dimMax[key];
    if (dim.score < 0 || dim.score > maxAllowed) errors.push(`${key}.score=${dim.score} buiten [0,${maxAllowed}]`);
    dimSum += dim.score;
    for (const s of dim.subScores) {
      if (!s.notApplicable && s.score > s.maxScore) errors.push(`${key}.${s.key}: score ${s.score} > maxScore ${s.maxScore}`);
    }
  }
  if (total < 0 || total > 100) errors.push(`total=${total} buiten [0,100]`);
  if (Math.abs(dimSum - total) > 1) errors.push(`dim-som=${dimSum} ≠ total=${total}`);

  if (errors.length) console.error('[scorer] Consistentiecheck gefaald:', errors.join('; '));
}

// ─── Kernbevindingen (deterministic) ──────────────────────────────────────

const KERN: Record<string, KernBevinding> = {
  'foto-aantal': {
    wat: "Onvoldoende aantal foto's",
    impact: "Advertenties met minder dan 15 beelden genereren aanzienlijk minder klikken — kopers scrollen voorbij.",
    strategischeLezing: "20+ foto's verhogen de verblijftijd en de kans op een bezichtigingsaanvraag meetbaar.",
  },
  'foto-kwaliteit': {
    wat: 'Matige technische fotokwaliteit',
    impact: "Donkere, wazige of scheefgetrokken beelden wekken onbewust twijfel over de kwaliteit van de woning zelf.",
    strategischeLezing: "Professionele fotografie of AI-retouche geeft het pand de marktconforme uitstraling die het verdient.",
  },
  'foto-volgorde': {
    wat: 'Niet-narratieve foto-volgorde',
    impact: "Kopers missen de emotionele doorwandeling van de woning, wat de betrokkenheid en urgentie vermindert.",
    strategischeLezing: "Gevel → woonkamer → keuken → slaapkamers → buiten: een logische volgorde vergroot de beleving.",
  },
  'grondplan-2d': {
    wat: 'Geen 2D-grondplan beschikbaar',
    impact: "Zonder grondplan kunnen rationele kopers de ruimtelijke indeling niet beoordelen — een harde drempel.",
    strategischeLezing: "Zelfs een schematisch 2D-plan overbrugt de onzekerheid en verhoogt de bezichtigingsratio.",
  },
  'grondplan-3d': {
    wat: 'Geen 3D-grondplan beschikbaar',
    impact: "Een isometrisch 3D-plan differentieert uw advertentie van concurrenten en versterkt de emotionele betrokkenheid.",
    strategischeLezing: "Een 3D-plan is een relatief kleine investering met meetbaar effect op de bezichtigingsratio.",
  },
  'structuur-volledigheid': {
    wat: 'Advertentietekst mist essentiële informatie',
    impact: "Kopers stellen zichzelf de vragen die uw tekst niet beantwoordt — en haken af zonder contact op te nemen.",
    strategischeLezing: "Een volledige tekst (ligging, indeling, EPC, renovatiestatus, troefpunten) verlaagt de drempel tot eerste contact.",
  },
  'onderscheidend-karakter': {
    wat: 'Generieke en clichématige beschrijving',
    impact: '"Lichtrijke woning" en "niet te missen" zijn onzichtbare zinnen — kopers verwerken ze als ruis.',
    strategischeLezing: "Authentieke, specifieke beschrijvingen binden de aandacht en rechtvaardigen de vraagprijs.",
  },
  'call-to-action': {
    wat: 'Geen duidelijke call-to-action',
    impact: "Geïnteresseerde kopers weten niet wat de volgende stap is — ze sluiten de pagina.",
    strategischeLezing: 'Een concrete CTA ("Bel voor een bezichtiging: 04XX XX XX XX") verlaagt de drempel en verhoogt de respons.',
  },
  'epc-info': {
    wat: 'EPC-informatie onvolledig of afwezig',
    impact: "Ontbrekende EPC-info is een wettelijke tekortkoming én een signaal van onvolledigheid voor kritische kopers.",
    strategischeLezing: "Vermeld zowel label als kengetal (kWh/m²/jaar) — verplicht én bepalend voor de vraagprijs.",
  },
  'renovatieplicht': {
    wat: 'Renovatieplicht niet vermeld',
    impact: "Het weglaten van de renovatieplicht is een juridisch risico dat aanleiding geeft tot geschillen na het compromis.",
    strategischeLezing: "Transparantie over renovatieverplichtingen wekt vertrouwen en voorkomt onaangename verrassingen.",
  },
  'asbestattest': {
    wat: 'Asbestattest niet vermeld',
    impact: "Kopers van panden gebouwd vóór 2001 verwachten informatie over asbest — het ontbreken wekt wantrouwen.",
    strategischeLezing: "Vermeld aanwezigheid én resultaat — ook bij positieve uitslag met beheersplan.",
  },
  'overstromingsrisico': {
    wat: 'Overstromingsgevoeligheid niet vermeld',
    impact: "Het niet vermelden van P- en G-score is een wettelijke overtreding in Vlaanderen.",
    strategischeLezing: "Vermeld de overstromingsgevoeligheid conform gewestelijke regelgeving.",
  },
  'stedenbouwkundig': {
    wat: 'Geen stedenbouwkundige informatie',
    impact: "Professionele en voorzichtige kopers verwachten info over bestemming en vergund gebruik.",
    strategischeLezing: "Vermeld de stedenbouwkundige bestemming of verwijs naar het beschikbare uittreksel.",
  },
  'contact-naam': {
    wat: 'Naam contactpersoon ontbreekt',
    impact: "Anonimiteit verlaagt het vertrouwen bij kopers die direct persoonlijk contact wensen.",
    strategischeLezing: "Een persoonsnaam maakt de interactie menselijker en verhoogt de respons.",
  },
  'contact-telefoon': {
    wat: 'Telefoonnummer ontbreekt',
    impact: "Kopers die liever bellen dan een formulier invullen, haken af bij gebrek aan direct nummer.",
    strategischeLezing: "Een direct telefoonnummer is de snelste brug naar een bezichtigingsafspraak.",
  },
  'contact-email': {
    wat: 'E-mailadres ontbreekt',
    impact: "Kopers die liever schrijven missen een directe contactmogelijkheid.",
    strategischeLezing: "Een zichtbaar e-mailadres geeft kopers het gevoel van controle bij het eerste contactmoment.",
  },
};

function buildKernbevindingen(breakdown: ScoreBreakdown): KernBevinding[] {
  type Candidate = { key: string; pct: number };
  const candidates: Candidate[] = [];

  for (const dim of Object.values(breakdown)) {
    for (const s of dim.subScores) {
      if (!s.notApplicable && s.maxScore > 0) {
        candidates.push({ key: s.key, pct: Math.round((s.score / s.maxScore) * 100) });
      }
    }
  }

  return candidates
    .filter((c) => c.pct < 85 && KERN[c.key])
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((c) => KERN[c.key]);
}

// ─── InterpretatieTekst (deterministic) ──────────────────────────────────

function buildInterpretatieText(total: number, breakdown: ScoreBreakdown): string {
  const d1 = breakdown.dim1.percentage;
  const d3 = breakdown.dim3.percentage;
  const d4 = breakdown.dim4.percentage;

  if (total < 35) {
    return `Met een totaalscore van ${total}/100 kampt deze advertentie met structurele tekortkomingen op meerdere niveaus tegelijk. Zowel de visuele presentatie${d3 < 50 ? ', de advertentietekst' : ''}${d4 < 50 ? ' als de wettelijke vermeldingen' : ''} vragen om een grondige heraanpak. Een geïntegreerde aanpak levert de meeste return.`;
  }
  if (total < 50) {
    const knelpunt = d1 < 40
      ? 'De visuele presentatie is de meest prangende zwakte.'
      : d4 < 50
      ? 'Wettelijke vermeldingen zijn onvolledig — dit vormt een compliance-risico.'
      : d3 < 50
      ? 'De advertentietekst overtuigt onvoldoende en mist essentiële informatie.'
      : 'Meerdere criteria scoren onder het marktgemiddelde.';
    return `Met ${total}/100 bevindt deze advertentie zich onder het marktgemiddelde. ${knelpunt} Gerichte verbeteringen op de zwakste vlakken leveren de meeste return op investering.`;
  }
  if (total < 65) {
    return `Een score van ${total}/100 toont een advertentie die aan de basisvereisten voldoet maar nog ruimte laat voor betekenisvolle verbetering.${d1 < 60 ? ' De visuele presentatie vraagt om aandacht.' : ''}${d4 < 70 ? ' Enkele wettelijke vermeldingen ontbreken.' : ''} Gerichte ingrepen op de zwakste subcriteria tillen deze advertentie naar een competitief niveau.`;
  }
  if (total < 80) {
    return `Met ${total}/100 presteert deze advertentie boven het marktgemiddelde. De fundamenten zijn aanwezig, maar specifieke lacunes bieden nog ruimte voor verbetering.${d1 >= 70 && d3 >= 70 ? ' Zowel visueel als tekstueel is er een solide basis.' : ''} Gerichte micro-interventies zijn voldoende om de advertentie naar het hoogste niveau te tillen.`;
  }
  return `Een sterke score van ${total}/100 weerspiegelt een advertentie die op de meeste vlakken goed tot uitstekend scoort.${d1 >= 80 ? ' De visuele presentatie is van professioneel niveau.' : ''}${d4 >= 80 ? ' Alle wettelijke vermeldingen zijn correct.' : ''} Lichte optimalisaties in zichtbaarheid kunnen het bereik nog verder vergroten.`;
}

// ─── Micro-diensten selectie ───────────────────────────────────────────────

function selectMicroServices(breakdown: ScoreBreakdown): string[] {
  const micros: string[] = [];

  const fotoKwal = breakdown.dim1.subScores.find((s) => s.key === 'foto-kwaliteit');
  const grond2d  = breakdown.dim2.subScores.find((s) => s.key === 'grondplan-2d');
  const grond3d  = breakdown.dim2.subScores.find((s) => s.key === 'grondplan-3d');
  const contact  = breakdown.dim5;

  if (fotoKwal && fotoKwal.score / fotoKwal.maxScore < 0.67) micros.push('ai-retouche');
  if (grond2d  && grond2d.score  === 0)                       micros.push('2d-schets');
  else if (grond3d && grond3d.score === 0)                    micros.push('3d-upgrade');
  if (contact.percentage < 70)                                micros.push('premium-immoweb');
  if (micros.length < 3)                                      micros.push('social');
  if (micros.length < 3)                                      micros.push('meta');

  return micros.slice(0, 3);
}

// ─── Main: calculateScores ────────────────────────────────────────────────

export function calculateScores(input: ScoringInput): {
  breakdown: ScoreBreakdown;
  total: number;
  kernbevindingen: KernBevinding[];
  interpretatieText: string;
} {
  const { listing, photoAnalysis, textAnalysis } = input;

  const dim1 = scoreDim1(listing, photoAnalysis);
  const dim2 = scoreDim2(listing);
  const dim3 = scoreDim3(textAnalysis);
  const dim4 = scoreDim4(listing);
  const dim5 = scoreDim5(listing);

  const breakdown: ScoreBreakdown = { dim1, dim2, dim3, dim4, dim5 };
  const total = Math.min(100, Math.round(dim1.score + dim2.score + dim3.score + dim4.score + dim5.score));

  runConsistencyCheck(breakdown, total);

  return {
    breakdown,
    total,
    kernbevindingen: buildKernbevindingen(breakdown),
    interpretatieText: buildInterpretatieText(total, breakdown),
  };
}

// ─── Recommendation (6-staps beslisboom) ─────────────────────────────────

export function deriveRecommendation(
  total: number,
  breakdown: ScoreBreakdown,
  _listing: ImmowebListing,
): { recommendation: Recommendation; recommendationWhy: string; recommendedMicros: string[] } {
  const d1 = breakdown.dim1.percentage;
  const d3 = breakdown.dim3.percentage;
  const d4 = breakdown.dim4.percentage;

  if (d1 < 30 && (d3 < 50 || d4 < 50)) {
    return {
      recommendation: 'COMPLEET',
      recommendationWhy: 'Fundamentele tekortkomingen op visueel, tekstueel en wettelijk vlak tegelijk — een geïntegreerde aanpak van strategie tot bod is de meest efficiënte weg vooruit.',
      recommendedMicros: [],
    };
  }
  if (d1 < 50) {
    return {
      recommendation: 'PRODUCTIE',
      recommendationWhy: 'De visuele presentatie is de cruciale bottleneck. Professionele fotografie en grondplan leveren de grootste return op investering.',
      recommendedMicros: [],
    };
  }
  if (d4 < 50) {
    return {
      recommendation: 'BASIS',
      recommendationWhy: 'Compliance-risico\'s op wettelijke vermeldingen vragen om begeleide aanpak — coaching zorgt voor een correcte en volledige advertentie.',
      recommendedMicros: [],
    };
  }
  if (d3 < 45) {
    return {
      recommendation: 'BASIS',
      recommendationWhy: 'De advertentietekst is te zwak om kopers te overtuigen — coaching en herschrijf leveren direct resultaat.',
      recommendedMicros: [],
    };
  }
  if (total >= 65) {
    const micros = selectMicroServices(breakdown);
    return {
      recommendation: 'MICRO',
      recommendationWhy: 'De advertentie is solide maar heeft specifieke lacunes die met gerichte losse diensten efficiënt worden gedicht.',
      recommendedMicros: micros,
    };
  }
  return {
    recommendation: 'ONLINE',
    recommendationWhy: 'Een goede basis aanwezig. Meer zichtbaarheid via AI-retouche, RFLCT-webpagina en social media is de logische volgende stap.',
    recommendedMicros: [],
  };
}

// ─── Werkpunten ───────────────────────────────────────────────────────────

export function buildWorkPoints(breakdown: ScoreBreakdown): string[] {
  return Object.values(breakdown)
    .flatMap((dim) => dim.subScores)
    .filter((s) => !s.notApplicable && s.issues.length > 0 && s.score / s.maxScore < 1)
    .sort((a, b) => (a.score / a.maxScore) - (b.score / b.maxScore))
    .flatMap((s) => s.issues.slice(0, 1))
    .slice(0, 5);
}
