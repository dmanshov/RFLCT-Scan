import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://www.immoweb.be/',
      },
    });
    const b64 = Buffer.from(res.data as ArrayBuffer).toString('base64');
    const ct = (res.headers['content-type'] as string | undefined) ?? 'image/jpeg';
    const mediaType = ct.split(';')[0].trim() as Base64Block['source']['media_type'];
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
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
      issues: ['Geen foto\'s gevonden in de advertentie.'],
      strengths: [],
    };
  }

  const urls = photoUrls.slice(0, 10);
  const downloaded = await Promise.all(urls.map(downloadAsBase64));
  const imageBlocks: Anthropic.ImageBlockParam[] = downloaded.filter((b): b is Base64Block => b !== null);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: `Je bent expert vastgoedfotograaf. Analyseer deze ${imageBlocks.length} foto('s) van een Immoweb-advertentie.

DEEL A — Technische kwaliteit (beoordeel alle foto's samen):
Gebruik uitsluitend de waarden 0, 1, 2 of 3.
| Aspect       | 0 = onvoldoende        | 1 = matig              | 2 = goed              | 3 = uitstekend         |
|--------------|------------------------|------------------------|-----------------------|------------------------|
| belichting   | Donker of overbelicht  | Merkbaar te licht/donk | Grotendeels correct   | Perfect belicht        |
| perspectief  | Scheef, crop slecht    | Enigszins scheef       | Rechte lijnen, goed   | Professioneel hoek     |
| witbalans    | Sterk kleurzweem       | Lichte kleurzweem      | Naturale kleuren      | Perfecte witbalans     |
| scherpte     | Wazig of onscherp      | Deels onscherp         | Grotendeels scherp    | Pixel-scherp           |
| consistentie | Heel wisselend stijl   | Enige inconsistentie   | Grotendeels coherent  | Uniforme presentatie   |

DEEL B — Narratieve volgorde:
Ideale volgorde: gevel → inkomhal → woonkamer → keuken → slaapkamers → badkamer → tuin/terras → garage/kelder
Kies EXACT één waarde: 10 (logisch + compleet), 7 (logisch maar incompleet), 4 (gedeeltelijk logisch), 1 (één duidelijke fout), 0 (chaotisch)

Geef enkel JSON terug:
{
  "belichting": 0-3,
  "perspectief": 0-3,
  "witbalans": 0-3,
  "scherpte": 0-3,
  "consistentie": 0-3,
  "sequenceScore": 0|1|4|7|10,
  "openingsFoto": "beschrijving van de eerste foto",
  "eersteZwakkePositie": null of 0-gebaseerde index,
  "logicalFlow": true/false,
  "issues": ["max 3 concrete tekortkomingen"],
  "strengths": ["max 2 concrete sterktes"]
}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const raw = parseJson<{
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

  return {
    belichting, perspectief, witbalans, scherpte, consistentie,
    qualityTotal: belichting + perspectief + witbalans + scherpte + consistentie,
    sequenceScore: clamp(raw.sequenceScore, [0, 1, 4, 7, 10]) as PhotoAnalysisResult['sequenceScore'],
    openingsFoto: raw.openingsFoto ?? '',
    eersteZwakkePositie: raw.eersteZwakkePositie ?? null,
    logicalFlow: !!raw.logicalFlow,
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
- 5 = Expliciete, concrete CTA met urgentie ("Bel vandaag", "Plan uw bezoek via…")
- 3 = Vage CTA aanwezig ("Neem contact op", "Interesse?")
- 0 = Geen CTA

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
