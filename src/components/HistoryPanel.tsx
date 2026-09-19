"use client";

import { useState } from "react";
import { validateCedula } from "@/lib/validation";
import { CaseRecord, Verdict } from "@/types";

const VERDICT_LABELS: Record<Verdict, string> = {
  preaprobado: "✅ Pre-aprobado",
  documentos_faltantes: "📋 Docs. faltantes",
  rechazado: "❌ Rechazado",
};

const VERDICT_COLORS: Record<Verdict, string> = {
  preaprobado: "text-green-700 bg-green-50",
  documentos_faltantes: "text-yellow-700 bg-yellow-50",
  rechazado: "text-red-700 bg-red-50",
};

// Notion's date-only values ("2026-09-18") parse as UTC midnight, which
// rolls back a day in negative-UTC timezones (e.g. Panama, UTC-5). Reading
// the Y-M-D digits directly and building a local-time Date avoids that shift.
function formatCaseDate(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PA");
}

export default function HistoryPanel({ isOpen = true }: { isOpen?: boolean }) {
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [cedula, setCedula] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [cases, setCases] = useState<CaseRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Limpiar el estado de forma síncrona durante el renderizado (sin useEffect)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setCedula("");
      setPolicyNumber("");
      setCases(null);
      setError("");
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const check = validateCedula(cedula);
    if (!check.valid) { setError(check.error!); return; }
    if (!policyNumber.trim() || policyNumber.trim().length < 3) {
      setError("Ingresá un número de póliza válido."); return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ cedula: cedula.trim(), policyNumber: policyNumber.trim() });
      const res = await fetch(`/api/history?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Error al consultar.");
      setCases(data.cases);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">
        Historial de casos
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Ingresá la misma cédula del formulario y el número de póliza tal como aparece en tu documento de póliza.
      </p>
      <form onSubmit={handleSearch} className="space-y-3 mb-4">
        <input
          id="history-cedula"
          name="cedula"
          type="text"
          aria-label="Cédula"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          placeholder="Ej: 8-888-8888"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 placeholder:opacity-100"
        />
        <input
          id="history-policy-number"
          name="policyNumber"
          type="text"
          aria-label="Número de póliza"
          value={policyNumber}
          onChange={(e) => setPolicyNumber(e.target.value)}
          placeholder="Ej: POL-2026-0001"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-blue-400 placeholder:text-gray-400 placeholder:opacity-100"
        />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-gray-700 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "Consultando…" : "Buscar historial"}
        </button>
      </form>

      {cases !== null && (
        <div className="space-y-3">
          {cases.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No hay casos registrados.</p>
          ) : (
            cases.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-gray-100 p-4 bg-gray-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${VERDICT_COLORS[c.verdict]}`}
                  >
                    {VERDICT_LABELS[c.verdict]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatCaseDate(c.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  <strong>Procedimiento:</strong>{" "}
                  {c.medicalReport.procedure ?? "—"}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{c.reason}</p>
                {c.suspicious && (
                  <p className="text-xs text-orange-500 mt-1">⚠️ Marcado para revisión manual</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
