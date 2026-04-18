import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PhotoAnalysisResult {
  overallScore: number;
  lighting: number;
  whiteBalance: number;
  composition: number;
  issues: string[];
  strengths: string[];
}

export interface TextAnalysisResult {
  score: number;
  persuasiveness: number;
  professionalism: number;
  completeness: number;
  issues: string[];
  strengths: string[];
}

export interface SequenceAnalysisResult {
  score: number;
  logicalFlow: boolean;
  issues: string[];
}

function parseJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Geen JSON gevonden in AI-antwoord');
  return JSON.parse(match[0]) as T;
}

export async function analyzePhotos(photoUrls: string[]): Promise<PhotoAnalysisResult> {
  if (photoUrls.length === 0) {
    return {
      overallScore: 0,
      lighting: 0,
      whiteBalance: 0,
      composition: 0,
      issues: ['Geen foto\'s gevonden in de advertentie.'],
      strengths: [],
    };
  }

  // Limit to 5 photos — keeps latency within Vercel's 60s hobby timeout
  const urls = photoUrls.slice(0, 5);

  const imageContent: Anthropic.ImageBlockParam[] = urls.map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Je bent een expert vastgoedfotograaf en beoordelaar. Analyseer deze ${urls.length} foto('s) van een Immoweb-advertentie.

Beoordeel de GLOBALE kwaliteit van alle foto's samen op deze criteria (schaal 0–100):
- Belichting: correct belicht, geen harde schaduwen of overbelichting
- Witbalans: natuurlijke kleuren, geen gele/blauwe kleurzweem
- Kadrering & compositie: goed hoekpunt, rechte verticale lijnen, ruimtegevoel

Geef JSON terug (geen andere tekst):
{
  "overallScore": 0-100,
  "lighting": 0-100,
  "whiteBalance": 0-100,
  "composition": 0-100,
  "issues": ["concreet probleem 1", ...],
  "strengths": ["concreet sterk punt 1", ...]
}

Wees objectief en specifiek. Vergelijk met professionele vastgoedfotografiestijl.`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJson<PhotoAnalysisResult>(text);
}

export async function analyzeText(title: string, description: string): Promise<TextAnalysisResult> {
  if (!description.trim()) {
    return {
      score: 0,
      persuasiveness: 0,
      professionalism: 0,
      completeness: 0,
      issues: ['Geen beschrijvingstekst gevonden in de advertentie.'],
      strengths: [],
    };
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Je bent een expert in vastgoedmarketing en copywriting. Analyseer de volgende Immoweb-advertentietekst.

Titel: "${title}"

Beschrijving:
"""
${description.slice(0, 3000)}
"""

Beoordeel (schaal 0–100):
- Overtuigingskracht: spreekt de doelgroep aan, wekt verlangen, roept emotie op
- Professionaliteit: geen spelfouten, goede structuur, correcte stijl
- Volledigheid: alle relevante kenmerken vermeld, niets essentiëls ontbreekt

Geef JSON terug (geen andere tekst):
{
  "score": 0-100,
  "persuasiveness": 0-100,
  "professionalism": 0-100,
  "completeness": 0-100,
  "issues": ["concreet probleem 1", ...],
  "strengths": ["concreet sterk punt 1", ...]
}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJson<TextAnalysisResult>(text);
}

export async function analyzePhotoSequence(photoUrls: string[]): Promise<SequenceAnalysisResult> {
  if (photoUrls.length < 2) {
    return { score: 30, logicalFlow: false, issues: ['Te weinig foto\'s om volgorde te beoordelen.'] };
  }

  const urls = photoUrls.slice(0, 10);
  const imageContent: Anthropic.ImageBlockParam[] = urls.map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Je bent een expert in vastgoedpresentatie. Beoordeel de VOLGORDE van deze ${urls.length} foto's zoals ze verschijnen in de advertentie (van eerste tot laatste).

Een goede logische volgorde voor een vastgoedadvertentie is:
gevel → voordeur / inkomhal → woonkamer / living → keuken → eetkamer → badkamer → slaapkamers → extra ruimtes → terras / tuin → garage / kelder / extra

Geef JSON terug (geen andere tekst):
{
  "score": 0-100,
  "logicalFlow": true/false,
  "issues": ["concreet probleem met de volgorde", ...]
}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJson<SequenceAnalysisResult>(text);
}
