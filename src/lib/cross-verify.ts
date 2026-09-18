// ──────────────────────────────────────────────────────────────────
// Business logic — cross-verification of AI verdict
// The backend recalculates the decision with its own simple rules
// and flags the case as suspicious when it diverges from the AI.
// ──────────────────────────────────────────────────────────────────

import { AIVerdict, Verdict } from "@/types";

/**
 * Recalculate the verdict using deterministic rules derived from
 * the already-extracted fields. Returns the backend verdict and
 * a flag indicating whether the AI verdict is suspicious.
 */
export function crossVerifyVerdict(aiResult: AIVerdict): {
  backendVerdict: Verdict;
  suspicious: boolean;
} {
  const { medicalReport, policy, status: aiStatus } = aiResult;

  // ── 1. Missing-document check ─────────────────────────────────
  const missingFields: string[] = [];

  if (!medicalReport?.procedure) missingFields.push("procedimiento (informe médico)");
  if (!medicalReport?.patientName) missingFields.push("nombre del paciente (informe médico)");
  if (!policy?.policyNumber) missingFields.push("número de póliza");
  if (!policy?.startDate) missingFields.push("fecha de inicio de vigencia");

  const coveredProcedures = Array.isArray(policy?.coveredProcedures)
    ? policy.coveredProcedures
    : [];

  if (coveredProcedures.length === 0) {
    missingFields.push("procedimientos cubiertos (póliza)");
  }

  if (missingFields.length > 0) {
    const backendVerdict: Verdict = "documentos_faltantes";
    return {
      backendVerdict,
      suspicious: aiStatus !== backendVerdict,
    };
  }

  // ── 2. Coverage check ────────────────────────────────────────
  const procedure = (medicalReport.procedure || "").toLowerCase();
  const covered = coveredProcedures.some((p) =>
    procedure.includes(p.toLowerCase()) || p.toLowerCase().includes(procedure)
  );

  const exclusions = Array.isArray(policy.exclusions) ? policy.exclusions : [];
  const excluded = exclusions.some((e) =>
    procedure.includes(e.toLowerCase())
  );

  if (!covered || excluded) {
    const backendVerdict: Verdict = "rechazado";
    return {
      backendVerdict,
      suspicious: aiStatus !== backendVerdict,
    };
  }

  // ── 3. Waiting-period check ───────────────────────────────────
  const policyStart = policy.startDate ? new Date(policy.startDate) : null;
  const reportDate = medicalReport.reportDate ? new Date(medicalReport.reportDate) : null;

  if (policyStart && reportDate && !isNaN(policyStart.getTime()) && !isNaN(reportDate.getTime())) {
    const daysSinceStart =
      (reportDate.getTime() - policyStart.getTime()) / (1000 * 60 * 60 * 24);

    const waitingPeriods = policy.waitingPeriods && typeof policy.waitingPeriods === "object"
      ? policy.waitingPeriods
      : {};

    // Look for a waiting period that matches the procedure
    for (const [procedureType, period] of Object.entries(waitingPeriods)) {
      const matches =
        procedure.includes(procedureType.toLowerCase()) ||
        procedureType.toLowerCase().includes(procedure);

      if (matches) {
        const waitingDays = parsePeriodToDays(period);
        if (waitingDays !== null && daysSinceStart < waitingDays) {
          const backendVerdict: Verdict = "rechazado";
          return {
            backendVerdict,
            suspicious: aiStatus !== backendVerdict,
          };
        }
      }
    }
  }

  // ── 4. All checks passed → pre-approved ──────────────────────
  const backendVerdict: Verdict = "preaprobado";
  return {
    backendVerdict,
    suspicious: aiStatus !== backendVerdict,
  };
}

/** Parses period strings like "6 meses", "180 días", "1 año" → days */
function parsePeriodToDays(period: string): number | null {
  if (typeof period !== "string") return null;
  const lower = period.toLowerCase().trim();
  const num = parseFloat(lower);
  if (isNaN(num)) return null;

  if (lower.includes("año") || lower.includes("year")) return Math.round(num * 365);
  if (lower.includes("mes") || lower.includes("month")) return Math.round(num * 30);
  if (lower.includes("día") || lower.includes("dia") || lower.includes("day")) return Math.round(num);
  return null;
}
