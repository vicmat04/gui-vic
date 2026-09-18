// ──────────────────────────────────────────────────────────────────
// Duplicate detection — checks Notion before processing as new case
// Priority: 1) folio match  2) combined signals
// ──────────────────────────────────────────────────────────────────

import { MedicalReportFields } from "@/types";
import { queryCasesByFolio, queryCasesBySignals } from "./notion-client";

const DAYS_THRESHOLD = 30; // cases within 30 days = possible duplicate

export async function isDuplicate(
  cedula: string,
  report: MedicalReportFields
): Promise<boolean> {
  // ── 1. Folio match (strongest signal) ────────────────────────
  if (report.folioNumber) {
    const folioMatch = await queryCasesByFolio(cedula, report.folioNumber);
    if (folioMatch) return true;
  }

  // ── 2. Combined signals ───────────────────────────────────────
  if (report.procedure && report.physicianOrCenter && report.reportDate) {
    const signalMatch = await queryCasesBySignals(cedula, {
      procedure: report.procedure,
      physicianOrCenter: report.physicianOrCenter,
      reportDate: report.reportDate,
      thresholdDays: DAYS_THRESHOLD,
    });
    if (signalMatch) return true;
  }

  return false;
}
