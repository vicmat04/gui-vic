// ──────────────────────────────────────────────────────────────────
// Groq client — document extraction + verdict (single call)
// Handles text documents (from digital PDFs) and images (from scans)
// ──────────────────────────────────────────────────────────────────

import Groq from "groq-sdk";
import { AIVerdict } from "@/types";
import { ParsedDocument } from "./document-parser";

// Lazy initialization — avoids build-time crash when env var is absent
let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

// Models updated 2026-09 — see https://console.groq.com/docs/models
const VISION_PRIMARY = "meta-llama/llama-4-scout-17b-16e-instruct";
const VISION_FALLBACK = "meta-llama/llama-4-maverick-17b-128e-instruct";
const TEXT_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
const TEXT_FALLBACK = "qwen/qwen3-32b";

const SYSTEM_PROMPT = `Eres un sistema de pre-autorización quirúrgica para una aseguradora.
Recibirás dos documentos: la PÓLIZA del paciente y el INFORME MÉDICO del hospital (en texto o imagen).

REGLAS ESTRICTAS:
1. Usa SOLO información literal visible en los documentos. Nunca inventes ni asumas datos.
2. Si un campo no es legible o no aparece, devuelve null para ese campo.
3. Para cada dato clave, cita textualmente la parte del documento donde lo encontraste.
4. El campo "status" SOLO puede ser uno de: "preaprobado", "documentos_faltantes", "rechazado".
5. "documentos_faltantes" aplica cuando: falta un archivo, falta un dato clave, o el documento no corresponde.
6. "rechazado" aplica cuando el procedimiento no está cubierto o no cumple el período de carencia.
7. Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin markdown.`;

const USER_PROMPT = `Analiza ambos documentos y devuelve EXACTAMENTE este JSON:
{
  "status": "preaprobado" | "documentos_faltantes" | "rechazado",
  "reason": "explicación breve de la decisión",
  "medicalReport": {
    "patientName": "...",
    "procedure": "...",
    "diagnosis": "...",
    "reportDate": "...",
    "physicianOrCenter": "...",
    "folioNumber": "..."
  },
  "policy": {
    "policyNumber": "...",
    "insuredName": "...",
    "startDate": "...",
    "coveredProcedures": ["..."],
    "exclusions": ["..."],
    "waitingPeriods": { "tipo_procedimiento": "período" }
  },
  "evidence": {
    "coveragePassage": "texto literal del documento que acredita cobertura",
    "waitingPeriodPassage": "texto literal sobre carencia"
  }
}`;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildUserContent(
  policyDoc: ParsedDocument,
  reportDoc: ParsedDocument
): ContentPart[] {
  const parts: ContentPart[] = [];

  // Póliza
  if (policyDoc.isText && policyDoc.textContent) {
    parts.push({
      type: "text",
      text: `### DOCUMENTO 1: PÓLIZA DEL PACIENTE (${policyDoc.filename})\n${policyDoc.textContent}\n`,
    });
  } else {
    parts.push({
      type: "text",
      text: `### DOCUMENTO 1: PÓLIZA DEL PACIENTE (${policyDoc.filename}) [IMAGEN]:`,
    });
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${policyDoc.mimeType || "image/jpeg"};base64,${policyDoc.base64}`,
      },
    });
  }

  // Informe Médico
  if (reportDoc.isText && reportDoc.textContent) {
    parts.push({
      type: "text",
      text: `### DOCUMENTO 2: INFORME MÉDICO (${reportDoc.filename})\n${reportDoc.textContent}\n`,
    });
  } else {
    parts.push({
      type: "text",
      text: `### DOCUMENTO 2: INFORME MÉDICO (${reportDoc.filename}) [IMAGEN]:`,
    });
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${reportDoc.mimeType || "image/jpeg"};base64,${reportDoc.base64}`,
      },
    });
  }

  parts.push({
    type: "text",
    text: USER_PROMPT,
  });

  return parts;
}

async function executeGroqCall(model: string, contentParts: ContentPart[]): Promise<AIVerdict> {
  const response = await getGroq().chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      // SAFETY: Groq SDK accepts ContentPart[] at runtime; the SDK types narrow to string
      { role: "user", content: contentParts as unknown as string },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  console.log(`[groq] [${model}] Raw response sample:`, raw.slice(0, 180));

  const jsonText = raw.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(jsonText) as AIVerdict;
  } catch {
    throw new Error(`[groq] Invalid JSON from model ${model}: ${jsonText.slice(0, 200)}`);
  }
}

export async function analyzeDocuments(
  policyDoc: ParsedDocument,
  reportDoc: ParsedDocument
): Promise<AIVerdict> {
  const contentParts = buildUserContent(policyDoc, reportDoc);
  const hasImages = !policyDoc.isText || !reportDoc.isText;

  const modelsToTry = hasImages
    ? [VISION_PRIMARY, VISION_FALLBACK]
    : [TEXT_MODEL, TEXT_FALLBACK];

  let lastError: unknown;

  for (const model of modelsToTry) {
    try {
      console.log(`[groq] Trying model: ${model} (hasImages: ${hasImages})`);
      return await executeGroqCall(model, contentParts);
    } catch (err) {
      lastError = err;
      console.warn(`[groq] Model ${model} failed, trying next:`, err);
    }
  }

  throw lastError;
}
