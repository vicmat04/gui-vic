// ──────────────────────────────────────────────────────────────────
// Domain types — Pre-Authorization Agent
// ──────────────────────────────────────────────────────────────────

export type Verdict = "preaprobado" | "documentos_faltantes" | "rechazado";

export interface MedicalReportFields {
  patientName: string | null;
  procedure: string | null;
  diagnosis: string | null;
  reportDate: string | null;
  physicianOrCenter: string | null;
  folioNumber: string | null;
}

export interface PolicyFields {
  policyNumber: string | null;
  insuredName: string | null;
  startDate: string | null;
  coveredProcedures: string[];
  exclusions: string[];
  waitingPeriods: Record<string, string>;
}

export interface AIVerdict {
  status: Verdict;
  reason: string;
  medicalReport: MedicalReportFields;
  policy: PolicyFields;
  evidence: {
    coveragePassage: string | null;
    waitingPeriodPassage: string | null;
  };
}

export interface CaseRecord {
  id?: string;
  cedula: string;
  policyNumber: string;
  verdict: Verdict;
  reason: string;
  medicalReport: MedicalReportFields;
  policy: PolicyFields;
  createdAt: string;
  suspicious?: boolean;
  errorState?: boolean;
  errorMessage?: string;
  documents?: { name: string; url: string }[];
}

export interface HistoryQuery {
  cedula: string;
  policyNumber: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface SubmitResponse {
  success: boolean;
  verdict?: Verdict;
  reason?: string;
  caseId?: string;
  suspicious?: boolean;
  duplicate?: boolean;
  error?: string;
}
