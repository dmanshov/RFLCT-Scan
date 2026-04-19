import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

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

  // Limit to 5 photos — keeps latency and token cost reasonable
  const urls = photoUrls.slice(0, 5);

  // Download images server-side and send as base64 — Immoweb CDN blocks Anthropic's IPs
  type Base64Block = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } };
  const downloaded = await Promise.all(
    urls.map(async (url): Promise<Base64Block | null> => {
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
        const mediaType = ct.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        return { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
      } catch {
        return null;
      }
    })
  );
  const imageContent: Anthropic.ImageBlockParam[] = downloaded.filter((b): b is Base64Block => b !== null);

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
        content: `Je bent een expert in Belgische vastgoedmarketing. Analyseer deze Immoweb-advertentie kritisch.

Titel: "${title}"

Beschrijving:
"""
${description.slice(0, 4000)}
"""

Beoordeel streng maar eerlijk op schaal 0–100:
- Overtuigingskracht: wekt verlangen, spreekt koper emotioneel aan, heeft een duidelijke call-to-action
- Professionaliteit: correcte spelling, vloeiende stijl, geen clichés, professionele toon
- Volledigheid: vermeldt ligging, troeven, indeling, staat van het pand, EPC, contactgegevens

Let specifiek op:
- Zijn contactgegevens (naam, telefoon, e-mail) aanwezig in de tekst?
- Wordt de ligging (straat, buurt, nabijheid voorzieningen) beschreven?
- Zijn woonoppervlakte en indeling duidelijk?
- Is er een call-to-action?

Geef JSON terug (geen andere tekst):
{
  "score": 0-100,
  "persuasiveness": 0-100,
  "professionalism": 0-100,
  "completeness": 0-100,
  "issues": ["max 3 concrete verbeterpunten, elk max 1 zin"],
  "strengths": ["max 2 concrete sterktes, elk max 1 zin"]
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
