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

// Qwen VL per plan spec — best OCR for dense documents (policy/medical report scans).
// Vision has no fallback model to switch to (only Qwen supports images on this account),
// so it retries itself, still benefiting from the 429/5xx backoff below.
const VISION_PRIMARY = "qwen/qwen3.8-27b";
const VISION_FALLBACK = "qwen/qwen3.8-27b";
// Plain text-to-text models, not "groq/compound(-mini)" — those are agentic Systems that
// can autonomously call web search / code execution, which breaks the plan's anti-
// hallucination rule (section 8: use ONLY literal info from the provided documents).
const TEXT_MODEL = "openai/gpt-oss-120b";
const TEXT_FALLBACK = "openai/gpt-oss-20b";

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
    temperature: 0.1, // low per plan section 8 — deterministic extraction, not creative
    max_completion_tokens: 2048,
    reasoning_effort: "medium", // needs to reason over coverage/exclusions/waiting periods, not just transcribe
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        // SAFETY: groq-sdk types content as string, but the OpenAI-compatible multimodal
        // API accepts an array of {type, text|image_url} parts at runtime.
        content: contentParts as unknown as string,
      },
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeDocuments(
  policyDoc: ParsedDocument,
  reportDoc: ParsedDocument
): Promise<AIVerdict> {
  const contentParts = buildUserContent(policyDoc, reportDoc);
  const hasImages = !policyDoc.isText || !reportDoc.isText;

  // Max 2 attempts total, per plan section 9.
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
      console.warn(`[groq] Model ${model} failed:`, err);

      // On 429/5xx, give the next attempt (fallback model) a moment before retrying.
      // Other 4xx errors fall through to the next model too — it's our existing
      // resilience net (e.g. a preview model rejecting a specific request shape).
      if (err instanceof Groq.APIError && err.status) {
        if (err.status === 429) {
          const retryAfterSec = Number(err.headers?.get?.("retry-after"));
          await sleep((Number.isFinite(retryAfterSec) ? retryAfterSec : 2) * 1000);
        } else if (err.status >= 500) {
          await sleep(500);
        }
      }
    }
  }

  throw lastError;
}
