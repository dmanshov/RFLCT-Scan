import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SCRAPER_KEY = process.env.SCRAPER_API_KEY ?? '';

// ─── Result interfaces ─────────────────────────────────────────────────────

export interface PhotoAnalysisResult {
  // Quality: 5 aspects × 0-3 discrete = 15pt max
  belichting: number;      // 0|1|2|3
  perspectief: number;     // 0|1|2|3
  witbalans: number;       // 0|1|2|3
  scherpte: number;        // 0|1|2|3
  consistentie: number;    // 0|1|2|3 (visuele eenheid over alle foto's)
  qualityTotal: number;    // som 0-15

  // Sequence: discrete spec values only
  sequenceScore: 0 | 1 | 4 | 7 | 10;
  openingsFoto: string;          // beschrijving van eerste foto
  eersteZwakkePositie: number | null; // 0-based index of first misordered photo, null if none
  logicalFlow: boolean;

  floorPlanIndices: number[];    // 0-based indices of photos identified as floor plans

  issues: string[];
  strengths: string[];
}

export interface TextAnalysisResult {
  // 1. Structuur & volledigheid: count of present checklist items (0-8)
  structuurVolledigheid: number;
  checklistItems: {
    liggingBeschreven: boolean;
    indelingBeschreven: boolean;
    oppervlaktesVermeld: boolean;
    epcVermeld: boolean;
    renovatieStatusVermeld: boolean;
    troefpuntenBeschreven: boolean;
    contactInfoAanwezig: boolean;
    afspraakmogelijkheidVermeld: boolean;
  };

  // 2. Onderscheidend karakter: discrete spec values
  onderscheidendKarakter: 0 | 3 | 5 | 7;
  cliches: string[];   // aangetroffen clichézinnen

  // 3. Call-to-action: discrete spec values
  callToAction: 0 | 3 | 5;

  issues: string[];
  strengths: string[];
}

// Kept for backward compat — route.ts still imports this type
export interface SequenceAnalysisResult {
  score: number;
  logicalFlow: boolean;
  issues: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Geen JSON gevonden in AI-antwoord');
  return JSON.parse(match[0]) as T;
}

function clamp(val: number, allowed: number[]): number {
  const sorted = [...allowed].sort((a, b) => a - b);
  return sorted.reduce((prev, curr) =>
    Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
  );
}

type Base64Block = {
  type: 'image';
  source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string };
};

async function downloadAsBase64(url: string): Promise<Base64Block | null> {
  // Attempt 1: direct download with realistic browser headers
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 12_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'nl-BE,nl;q=0.9',
        'Referer': 'https://www.immoweb.be/',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    const buf = res.data as ArrayBuffer;
    if (buf.byteLength < 500) throw new Error('too small');
    const ct = (res.headers['content-type'] as string | undefined) ?? 'image/jpeg';
    const mediaType = ct.split(';')[0].trim() as Base64Block['source']['media_type'];
    if (!mediaType.startsWith('image/')) throw new Error('not an image');
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(buf).toString('base64') } };
  } catch {
    // intentional fall-through to ScraperAPI
  }

  // Attempt 2: proxy via ScraperAPI (same key used for HTML scraping)
  if (!SCRAPER_KEY) return null;
  try {
    const scraperUrl = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`;
    const res = await axios.get<ArrayBuffer>(scraperUrl, {
      responseType: 'arraybuffer',
      timeout: 20_000,
    });
    const buf = res.data as ArrayBuffer;
    if (buf.byteLength < 500) return null;
    const ct = (res.headers['content-type'] as string | undefined) ?? 'image/jpeg';
    const mediaType = ct.split(';')[0].trim() as Base64Block['source']['media_type'];
    if (!mediaType.startsWith('image/')) return null;
    console.info(`[analyzer] Photo via ScraperAPI: ${url.slice(-40)}`);
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(buf).toString('base64') } };
  } catch {
    return null;
  }
}

// ─── Photo analysis (quality + sequence — single AI call) ─────────────────

export async function analyzePhotos(photoUrls: string[]): Promise<PhotoAnalysisResult> {
  if (photoUrls.length === 0) {
    return {
      belichting: 0, perspectief: 0, witbalans: 0, scherpte: 0, consistentie: 0,
      qualityTotal: 0,
      sequenceScore: 0, openingsFoto: 'Geen foto\'s', eersteZwakkePositie: null, logicalFlow: false,
      floorPlanIndices: [],
      issues: ['Geen foto\'s gevonden in de advertentie.'],
      strengths: [],
    };
  }

  const urls = photoUrls.slice(0, 10);
  const downloaded = await Promise.all(urls.map(downloadAsBase64));
  const imageBlocks: Anthropic.ImageBlockParam[] = downloaded.filter((b): b is Base64Block => b !== null);
  console.info(`[analyzer] Photos: ${photoUrls.length} total, ${urls.length} attempted, ${imageBlocks.length} loaded`);

  // If no photos could be loaded, return a clear fallback (don't let Claude hallucinate)
  if (imageBlocks.length === 0) {
    return {
      belichting: 0, perspectief: 0, witbalans: 0, scherpte: 0, consistentie: 0,
      qualityTotal: 0,
      sequenceScore: 0, openingsFoto: 'Foto\'s konden niet worden geladen', eersteZwakkePositie: null, logicalFlow: false,
      floorPlanIndices: [],
      issues: [`${photoUrls.length} foto('s) gevonden maar niet laadbaar (CDN-blokkade). Fotokwaliteit kon niet worden beoordeeld.`],
      strengths: [],
    };
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1400,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: `Je bent expert vastgoedfotograaf. Je analyseert de EERSTE ${imageBlocks.length} foto's (van ${photoUrls.length} totaal) van een Immoweb-advertentie, IN VOLGORDE (foto 1 = eerste in de advertentie).

STAP 0 — Grondplan-detectie:
Bekijk alle ${imageBlocks.length} foto's. Een grondplan is UITSLUITEND een technische bovenaanzicht-tekening met kameraanduidingen (bijv. "woonkamer", "slaapkamer") of meetlijnen in meters — zoals een architect of landmeter opmaakt. Geef de 0-gebaseerde indices terug van foto's die hieraan voldoen.

TELT NIET als grondplan (→ niet opnemen):
- Artistieke schetsen of aquarellen van een woning (zelfs al lijken ze op een plattegrond)
- Exterieur-illustraties, 3D-renders of artist impressions
- Foto's van een tuinontwerp of terrasschets
- Decoratieve tekeningen zonder maatlijnen of ruimtelabels
- Gewone interieur- of exterieurbeelden
Bij twijfel: NIET opnemen. Geen grondplannen → lege array.

STAP 1 — Ruimte-identificatie (intern, verschijnt NIET in JSON):
Noteer voor elke foto het type ruimte/element: exterieur/gevel, tuin/terras, hal/inkomhal, living/woonkamer, keuken, eetkamer, slaapkamer, badkamer, bureau, bergruimte/kelder, garage, of detail/overig.

STAP 2 — Technische kwaliteit en presentatie (beoordeel alle ${imageBlocks.length} foto's samen):
Gebruik UITSLUITEND 0, 1, 2 of 3.

HOOGSTE PRIORITEIT — deze twee aspecten wegen het zwaarst en moeten in issues ALTIJD als eerste worden vermeld:

| Aspect                        | 0 = onvoldoende                                                                                      | 1 = matig                                           | 2 = goed                                         | 3 = uitstekend                                     |
|-------------------------------|------------------------------------------------------------------------------------------------------|-----------------------------------------------------|--------------------------------------------------|----------------------------------------------------|
| belichting ⚡ (PRIORITEIT)    | Uitgebrande ramen/hemel, donkere kamers, lampen niet aan overdag, harde schaduwzones                 | Zichtbare maar milde belichtingsproblemen            | Grotendeels correct belicht, meeste lampen aan   | Perfect — alle lampen aan, geen uitbranding/schaduwen |
| perspectief/compositie ⚡ (PRIORITEIT) | Sterk scheeve of gekantelde horizont, deuren nemen >40% van frame in, kromlijnige muren, wanden niet verticaal | Enigszins scheef, 1 deur in frame, lichte vertekening | Rechte horizontale en verticale lijnen, goede kadrage | Professioneel hoek, ruimtelijk gevoel, perfecte rechte lijnen |

TWEEDE PRIORITEIT:

| Aspect        | 0 = onvoldoende                                                    | 1 = matig                                      | 2 = goed                        | 3 = uitstekend                         |
|---------------|--------------------------------------------------------------------|------------------------------------------------|---------------------------------|----------------------------------------|
| witbalans     | Sterke kleurzweem (geel/blauw/oranje)                              | Lichte kleurzweem                              | Naturale kleuren                | Perfecte witbalans                     |
| scherpte      | Wazig, bewogen of onscherp                                         | Deels onscherp                                 | Grotendeels scherp              | Pixel-scherp                           |
| presentatie   | Rommel, gekreukt beddengoed, persoonlijke items, onopgeruimd       | 1–2 storende elementen (kussen scheef, glas)   | Grotendeels netjes en gestileerd| Opgeruimd, gestileerd, professioneel   |

Beoordeel perspectief/compositie streng op: horizontale lijnen (vloer, plafond, raamkozijnen) die recht moeten zijn; verticale lijnen (muren, deuren, hoekpijlers) die niet mogen hellend zijn; deuren die open staan en het frame domineren of de ruimte blokkeren; fish-eye of tonvormige vervorming.

VOLGORDE VAN ISSUES: vermeld belichting/verlichting-problemen ALTIJD EERST, dan perspectief/compositie-problemen, daarna presentatie/overige. Max 3 issues totaal.

STAP 3 — Narratieve volgorde (gebaseerd op Stap 1):
Ideale volgorde: exterieur/gevel → hal → living/woonkamer → keuken/eetkamer → slaapkamers → badkamer(s) → tuin/terras → garage/kelder

Kies EXACT één waarde — wees NIET te streng:
- 10 = Volgt ideale volgorde volledig, exterieur als openingsfoto
- 7 = Grotendeels logisch (kleine afwijking of exterieur niet als allereerste foto)
- 4 = Gedeeltelijk logisch — kies dit OOK bij twijfel of beperkte zichtbaarheid
- 1 = Één duidelijke volgorde-fout die storend is
- 0 = Chaotisch, totaal geen logische structuur — enkel bij overduidelijke wanorde

Bij twijfel: kies altijd de hogere score (4 in plaats van 1, 7 in plaats van 4).

REGELS voor issues/strengths:
- Vermeld ALLEEN concrete kwaliteits- of presentatie-problemen (uitgebrande ramen, gekreukt beddengoed, lampen uit, rommel, scheefstaand perspectief, deuren die kader domineren) of concrete volgorde-fouten ("Keuken verschijnt vóór woonkamer")
- Meld NOOIT ontbrekende ruimtetypes — je ziet slechts ${imageBlocks.length} van ${photoUrls.length} foto's
- Max 3 issues, max 2 strengths — concreet en max 1 zin elk

Geef ENKEL JSON terug:
{
  "floorPlanIndices": [0-gebaseerde indices van grondplan-foto's, of lege array],
  "belichting": 0-3,
  "perspectief": 0-3,
  "witbalans": 0-3,
  "scherpte": 0-3,
  "consistentie": 0-3,
  "sequenceScore": 0|1|4|7|10,
  "openingsFoto": "beschrijving van wat de eerste foto toont",
  "eersteZwakkePositie": null of 0-gebaseerde index van eerste volgorde-fout,
  "logicalFlow": true/false,
  "issues": ["concreet probleem"],
  "strengths": ["concrete sterkte"]
}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const raw = parseJson<{
    floorPlanIndices: number[];
    belichting: number; perspectief: number; witbalans: number; scherpte: number; consistentie: number;
    sequenceScore: number; openingsFoto: string; eersteZwakkePositie: number | null;
    logicalFlow: boolean; issues: string[]; strengths: string[];
  }>(text);

  const asp = (v: number) => Math.max(0, Math.min(3, Math.round(v)));
  const belichting = asp(raw.belichting);
  const perspectief = asp(raw.perspectief);
  const witbalans = asp(raw.witbalans);
  const scherpte = asp(raw.scherpte);
  const consistentie = asp(raw.consistentie);

  const floorPlanIndices = Array.isArray(raw.floorPlanIndices)
    ? raw.floorPlanIndices.filter((i): i is number => typeof i === 'number' && i >= 0 && i < imageBlocks.length)
    : [];
  console.info(`[analyzer] Visual floor plan detection: indices ${JSON.stringify(floorPlanIndices)}`);

  return {
    belichting, perspectief, witbalans, scherpte, consistentie,
    qualityTotal: belichting + perspectief + witbalans + scherpte + consistentie,
    sequenceScore: clamp(raw.sequenceScore, [0, 1, 4, 7, 10]) as PhotoAnalysisResult['sequenceScore'],
    openingsFoto: raw.openingsFoto ?? '',
    eersteZwakkePositie: raw.eersteZwakkePositie ?? null,
    logicalFlow: !!raw.logicalFlow,
    floorPlanIndices,
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
  };
}

// ─── Text analysis ────────────────────────────────────────────────────────

export async function analyzeText(title: string, description: string): Promise<TextAnalysisResult> {
  if (!description.trim()) {
    return {
      structuurVolledigheid: 0,
      checklistItems: {
        liggingBeschreven: false, indelingBeschreven: false, oppervlaktesVermeld: false,
        epcVermeld: false, renovatieStatusVermeld: false, troefpuntenBeschreven: false,
        contactInfoAanwezig: false, afspraakmogelijkheidVermeld: false,
      },
      onderscheidendKarakter: 0,
      cliches: [],
      callToAction: 0,
      issues: ['Geen beschrijvingstekst gevonden in de advertentie.'],
      strengths: [],
    };
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Je bent expert in Belgische vastgoedmarketing. Analyseer deze Immoweb-advertentietekst.

Titel: "${title}"

Beschrijving:
"""
${description.slice(0, 4000)}
"""

CRITERIUM 1 — Structuur & volledigheid (8 checkboxes):
Beoordeel elk element: aanwezig (true) of afwezig (false).
- liggingBeschreven: ligging, buurt, nabijheid voorzieningen beschreven
- indelingBeschreven: indeling van het pand, verdiepingen, kamers beschreven
- oppervlaktesVermeld: woonoppervlakte en/of perceeloppervlakte vermeld
- epcVermeld: EPC-score of energielabel vermeld in de tekst
- renovatieStatusVermeld: staat van het pand, renovaties, of moderniseringen vermeld
- troefpuntenBeschreven: specifieke troeven van het pand benoemd
- contactInfoAanwezig: contactpersoon (naam, telefoon, e-mail) in de tekst aanwezig
- afspraakmogelijkheidVermeld: vermelding van bezichtigingsafspraak of contactmoment

CRITERIUM 2 — Onderscheidend karakter:
Kies EXACT één waarde:
- 7 = Geen clichés, authentieke en onderscheidende toon, levendige beeldtaal
- 5 = Overwegend origineel, maar 1-2 losse clichés
- 3 = Mix van origineel en generiek, meerdere clichés
- 0 = Volledig generiek, droog opsommend, geen emotionele aankleding
Clichévoorbeelden: "lichtrijke woning", "riant perceel", "te bezoeken", "niet te missen", "droomwoning"

CRITERIUM 3 — Call-to-action:
Kies EXACT één waarde:
- 5 = Expliciete, concrete CTA met urgentie ("Bel vandaag", "Plan uw bezoek via…") OF een aankondiging van een bezoekdag / open huis / kijkdag / infomoment
- 3 = Vage CTA aanwezig ("Neem contact op", "Interesse?") OF enkel "op afspraak" zonder verdere uitnodiging
- 0 = Geen CTA

REGEL: Als de tekst een bezoekdag, open huis, kijkdag of infomoment aankondigt → kies ALTIJD score 5 en zet GEEN CTA-issue in de issues-array.

Geef enkel JSON terug:
{
  "checklistItems": {
    "liggingBeschreven": true/false,
    "indelingBeschreven": true/false,
    "oppervlaktesVermeld": true/false,
    "epcVermeld": true/false,
    "renovatieStatusVermeld": true/false,
    "troefpuntenBeschreven": true/false,
    "contactInfoAanwezig": true/false,
    "afspraakmogelijkheidVermeld": true/false
  },
  "onderscheidendKarakter": 0|3|5|7,
  "cliches": ["aangetroffen clichézin 1", ...],
  "callToAction": 0|3|5,
  "issues": ["max 3 concrete verbeterpunten"],
  "strengths": ["max 2 concrete sterktes"]
}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const raw = parseJson<{
    checklistItems: TextAnalysisResult['checklistItems'];
    onderscheidendKarakter: number;
    cliches: string[];
    callToAction: number;
    issues: string[];
    strengths: string[];
  }>(text);

  const checklist: TextAnalysisResult['checklistItems'] = {
    liggingBeschreven: !!raw.checklistItems?.liggingBeschreven,
    indelingBeschreven: !!raw.checklistItems?.indelingBeschreven,
    oppervlaktesVermeld: !!raw.checklistItems?.oppervlaktesVermeld,
    epcVermeld: !!raw.checklistItems?.epcVermeld,
    renovatieStatusVermeld: !!raw.checklistItems?.renovatieStatusVermeld,
    troefpuntenBeschreven: !!raw.checklistItems?.troefpuntenBeschreven,
    contactInfoAanwezig: !!raw.checklistItems?.contactInfoAanwezig,
    afspraakmogelijkheidVermeld: !!raw.checklistItems?.afspraakmogelijkheidVermeld,
  };
  const structuurVolledigheid = Object.values(checklist).filter(Boolean).length;

  return {
    structuurVolledigheid,
    checklistItems: checklist,
    onderscheidendKarakter: clamp(raw.onderscheidendKarakter, [0, 3, 5, 7]) as TextAnalysisResult['onderscheidendKarakter'],
    cliches: Array.isArray(raw.cliches) ? raw.cliches : [],
    callToAction: clamp(raw.callToAction, [0, 3, 5]) as TextAnalysisResult['callToAction'],
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
  };
}
