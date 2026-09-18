// ──────────────────────────────────────────────────────────────────
// POST /api/analyze — main endpoint: validate → AI → cross-verify
//                     → duplicate-check → save in Notion
// ──────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { validateCedula } from "@/lib/validation";
import { analyzeDocuments } from "@/lib/groq-client";
import { crossVerifyVerdict } from "@/lib/cross-verify";
import { isDuplicate } from "@/lib/duplicate-detection";
import { saveCase } from "@/lib/notion-client";
import { checkRateLimit } from "@/lib/rate-limiter";
import { AIVerdict, CaseRecord, SubmitResponse, Verdict } from "@/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export async function POST(req: NextRequest): Promise<NextResponse<SubmitResponse>> {
  // ── Rate limit ────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rateResult = checkRateLimit(ip);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en unos minutos." },
      { status: 429 }
    );
  }

  // ── Parse form data ───────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Solicitud malformada." },
      { status: 400 }
    );
  }

  const cedula = (formData.get("cedula") as string | null)?.trim() ?? "";
  const policyFile = formData.get("policy") as File | null;
  const reportFile = formData.get("report") as File | null;

  // ── Validate cedula ───────────────────────────────────────────
  const cedulaResult = validateCedula(cedula);
  if (!cedulaResult.valid) {
    return NextResponse.json(
      { success: false, error: cedulaResult.error },
      { status: 400 }
    );
  }

  // ── Validate files (before calling AI) ───────────────────────
  const fileError = validateUploadedFile(policyFile, "póliza") ??
    validateUploadedFile(reportFile, "informe médico");
  if (fileError) {
    return NextResponse.json({ success: false, error: fileError }, { status: 400 });
  }

  // ── Convert to base64 ─────────────────────────────────────────
  const [policyBytes, reportBytes] = await Promise.all([
    policyFile!.arrayBuffer(),
    reportFile!.arrayBuffer(),
  ]);
  const policyBase64 = Buffer.from(policyBytes).toString("base64");
  const reportBase64 = Buffer.from(reportBytes).toString("base64");
  const policyMime = policyFile!.type;
  const reportMime = reportFile!.type;

  const createdAt = new Date().toISOString();

  // ── Call Groq ─────────────────────────────────────────────────
  let aiResult: AIVerdict;
  try {
    aiResult = await analyzeDocuments(policyBase64, reportBase64, policyMime, reportMime);
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message ?? String(err);
    console.error("[analyze] Groq analyzeDocuments failed:", errorMsg);

    const userMessage = errorMsg.includes("RATE_LIMIT")
      ? "El sistema de IA está ocupado. Intentá en unos segundos."
      : errorMsg.includes("INVALID_REQUEST")
      ? "Verificá que los documentos subidos sean legibles (PDF o imagen)."
      : "Hubo un problema temporal con el servicio de IA. Intentá nuevamente.";

    // Best-effort audit trail — do not let a Notion failure mask the real error
    try {
      await saveCase({
        cedula,
        policyNumber: "desconocido",
        verdict: "documentos_faltantes",
        reason: `Error de procesamiento IA: ${errorMsg.slice(0, 300)}`,
        medicalReport: {
          patientName: null,
          procedure: null,
          diagnosis: null,
          reportDate: null,
          physicianOrCenter: null,
          folioNumber: null,
        },
        policy: {
          policyNumber: null,
          insuredName: null,
          startDate: null,
          coveredProcedures: [],
          exclusions: [],
          waitingPeriods: {},
        },
        createdAt,
        errorState: true,
        errorMessage: errorMsg.slice(0, 500),
      });
    } catch (auditErr) {
      console.error("[analyze] Notion audit-trail save failed:", auditErr);
    }

    return NextResponse.json({ success: false, error: userMessage }, { status: 502 });
  }

  // ── Validate AI output structure ──────────────────────────────
  const validationError = validateAIOutput(aiResult);
  if (validationError) {
    return NextResponse.json(
      { success: false, error: "La respuesta del sistema de IA fue inválida. Reintentá." },
      { status: 502 }
    );
  }

  // ── Cross-verify verdict ──────────────────────────────────────
  const { backendVerdict, suspicious } = crossVerifyVerdict(aiResult);

  // ── Duplicate detection ───────────────────────────────────────
  const duplicate = await isDuplicate(cedula, aiResult.medicalReport);
  if (duplicate) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      verdict: aiResult.status,
      reason: "Caso duplicado detectado. Se devuelve el veredicto anterior.",
    });
  }

  // ── Determine final verdict ───────────────────────────────────
  // Suspicious cases use the backend (deterministic) verdict, not the AI's
  const finalVerdict: Verdict = suspicious ? backendVerdict : aiResult.status;
  const finalReason = suspicious
    ? `[REVISIÓN MANUAL] Veredicto IA: ${aiResult.status}. Backend: ${backendVerdict}. Razón IA: ${aiResult.reason}`
    : aiResult.reason;

  // ── Save to Notion ────────────────────────────────────────────
  const record: CaseRecord = {
    cedula,
    policyNumber: aiResult.policy.policyNumber ?? "desconocido",
    verdict: finalVerdict,
    reason: finalReason,
    medicalReport: aiResult.medicalReport,
    policy: aiResult.policy,
    createdAt,
    suspicious,
  };

  let caseId: string | undefined;
  try {
    caseId = await saveCase(record);
  } catch (notionErr) {
    console.error("[analyze] Notion save failed:", notionErr);
    // Return the verdict anyway — Notion is storage, not the decision
    return NextResponse.json({
      success: true,
      verdict: finalVerdict,
      reason: finalReason,
      suspicious,
      warning: "El resultado no pudo guardarse en la base de datos.",
    });
  }

  return NextResponse.json({
    success: true,
    verdict: finalVerdict,
    reason: finalReason,
    caseId,
    suspicious,
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function validateUploadedFile(file: File | null, label: string): string | null {
  if (!file || file.size === 0) return `El archivo de ${label} está vacío.`;
  if (file.size < 50) return `El archivo de ${label} parece corrupto.`;
  if (file.size > MAX_FILE_SIZE) return `El archivo de ${label} supera el límite de 10 MB.`;

  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  const isPdf =
    type === "application/pdf" ||
    type.includes("pdf") ||
    name.endsWith(".pdf");

  const isImage =
    type.startsWith("image/") ||
    /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(name);

  if (!isPdf && !isImage) {
    return `El archivo de ${label} debe ser PDF o imagen (JPEG, PNG, WEBP).`;
  }
  return null;
}

const VALID_STATUSES = new Set(["preaprobado", "documentos_faltantes", "rechazado"]);

function validateAIOutput(result: AIVerdict): string | null {
  if (!result || typeof result !== "object") return "Respuesta no es un objeto.";
  if (!VALID_STATUSES.has(result.status)) return "Estado inválido.";
  if (typeof result.reason !== "string") return "Razón inválida.";
  if (!result.medicalReport || !result.policy) return "Campos faltantes.";
  return null;
}
