// ──────────────────────────────────────────────────────────────────
// Groq client — document extraction + verdict (single call)
// ──────────────────────────────────────────────────────────────────

import Groq from "groq-sdk";
import { AIVerdict } from "@/types";

// Lazy initialization — avoids build-time crash when env var is absent
let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"; // vision model available on free tier

const SYSTEM_PROMPT = `Eres un sistema de pre-autorización quirúrgica para una aseguradora.
Recibirás dos imágenes: la PÓLIZA del paciente y el INFORME MÉDICO del hospital.

REGLAS ESTRICTAS:
1. Usa SOLO información literal visible en las imágenes. Nunca inventes ni asumas datos.
2. Si un campo no es legible o no aparece, devuelve null para ese campo.
3. Para cada dato clave, cita textualmente la parte del documento donde lo encontraste.
4. El campo "status" SOLO puede ser uno de: "preaprobado", "documentos_faltantes", "rechazado".
5. "documentos_faltantes" aplica cuando: falta un archivo, falta un dato clave, o el documento no corresponde.
6. "rechazado" aplica cuando el procedimiento no está cubierto o no cumple el período de carencia.
7. Devuelve ÚNICAMENTE JSON válido, sin texto adicional, sin markdown.`;

const USER_PROMPT = `Analiza los documentos adjuntos y devuelve EXACTAMENTE este JSON:
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

async function callGroq(
  policyBase64: string,
  reportBase64: string,
  policyMime: string,
  reportMime: string
): Promise<AIVerdict> {
  const response = await getGroq().chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    max_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "PÓLIZA:" },
          {
            type: "image_url",
            image_url: { url: `data:${policyMime};base64,${policyBase64}` },
          },
          { type: "text", text: "INFORME MÉDICO:" },
          {
            type: "image_url",
            image_url: { url: `data:${reportMime};base64,${reportBase64}` },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  // Strip possible markdown code fences
  const jsonText = raw.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
  return JSON.parse(jsonText) as AIVerdict;
}

const RETRY_LIMIT = 2;

export async function analyzeDocuments(
  policyBase64: string,
  reportBase64: string,
  policyMime: string,
  reportMime: string
): Promise<AIVerdict> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      return await callGroq(policyBase64, reportBase64, policyMime, reportMime);
    } catch (err: unknown) {
      lastError = err;

      const status = (err as { status?: number })?.status;

      if (status === 429) {
        // Honor Retry-After if present; default 5 s
        const retryAfter =
          (err as { headers?: Record<string, string> })?.headers?.[
            "retry-after"
          ];
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        if (attempt < RETRY_LIMIT) await sleep(waitMs);
        continue;
      }

      if (status && status >= 500 && attempt < RETRY_LIMIT) {
        await sleep(2000);
        continue;
      }

      // 4xx (non-429) or parse error — don't retry
      throw mapGroqError(err);
    }
  }

  throw mapGroqError(lastError);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapGroqError(err: unknown): Error {
  const status = (err as { status?: number })?.status;
  if (status === 429) {
    return new Error("RATE_LIMIT");
  }
  if (status && status >= 500) {
    return new Error("SERVER_ERROR");
  }
  if (status && status >= 400) {
    return new Error("INVALID_REQUEST");
  }
  return new Error("UNKNOWN_ERROR");
}
