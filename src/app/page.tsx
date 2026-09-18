"use client";

import { useState, useRef } from "react";
import { validateFile, validateCedula } from "@/lib/validation";
import ResultCard from "@/components/ResultCard";
import HistoryPanel from "@/components/HistoryPanel";
import { SubmitResponse } from "@/types";

type Step = "form" | "loading" | "result";

export default function HomePage() {
  const [step, setStep] = useState<Step>("form");
  const [cedula, setCedula] = useState("");
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const policyRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLInputElement>(null);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    const cedulaCheck = validateCedula(cedula);
    if (!cedulaCheck.valid) newErrors.cedula = cedulaCheck.error!;

    if (!policyFile) {
      newErrors.policy = "Adjuntá la póliza del paciente.";
    } else {
      const pCheck = validateFile(policyFile, "póliza");
      if (!pCheck.valid) newErrors.policy = pCheck.error!;
    }

    if (!reportFile) {
      newErrors.report = "Adjuntá el informe médico.";
    } else {
      const rCheck = validateFile(reportFile, "informe médico");
      if (!rCheck.valid) newErrors.report = rCheck.error!;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setStep("loading");
    const body = new FormData();
    body.append("cedula", cedula);
    body.append("policy", policyFile!);
    body.append("report", reportFile!);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body });
      const data: SubmitResponse = await res.json();
      setResult(data);
      setStep("result");
    } catch {
      setResult({ success: false, error: "Error de conexión. Revisá tu internet e intentá de nuevo." });
      setStep("result");
    }
  }

  function reset() {
    setStep("form");
    setCedula("");
    setPolicyFile(null);
    setReportFile(null);
    setErrors({});
    setResult(null);
    setShowHistory(false);
    if (policyRef.current) policyRef.current.value = "";
    if (reportRef.current) reportRef.current.value = "";
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl">🏥</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Pre-Autorización Quirúrgica</h1>
          <p className="text-gray-500 mt-2">Sistema inteligente de análisis de cobertura</p>
        </div>

        {/* Form */}
        {step === "form" && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Cédula */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Número de Cédula
                </label>
                <input
                  type="text"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Ej: 8-888-8888"
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-colors outline-none focus:ring-2 focus:ring-blue-200 ${
                    errors.cedula
                      ? "border-red-400 bg-red-50"
                      : "border-gray-200 focus:border-blue-500"
                  }`}
                />
                {errors.cedula && (
                  <p className="text-red-500 text-sm mt-1">{errors.cedula}</p>
                )}
              </div>

              {/* Póliza */}
              <FileInput
                id="policy"
                label="Póliza del Paciente"
                icon="📋"
                accept=".pdf,image/jpeg,image/png,image/webp"
                file={policyFile}
                onChange={setPolicyFile}
                error={errors.policy}
                ref={policyRef}
              />

              {/* Informe médico */}
              <FileInput
                id="report"
                label="Informe Médico"
                icon="🩺"
                accept=".pdf,image/jpeg,image/png,image/webp"
                file={reportFile}
                onChange={setReportFile}
                error={errors.report}
                ref={reportRef}
              />

              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition-all duration-150 shadow-md hover:shadow-lg"
              >
                Analizar Documentos
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                {showHistory ? "Ocultar historial" : "Consultar historial de casos"}
              </button>
            </div>

            {showHistory && <HistoryPanel />}
          </div>
        )}

        {/* Loading */}
        {step === "loading" && (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Analizando documentos…</h2>
            <p className="text-gray-500 text-sm">
              La IA está verificando cobertura, exclusiones y período de carencia.
              <br />
              Esto tarda unos segundos.
            </p>
          </div>
        )}

        {/* Result */}
        {step === "result" && result && (
          <ResultCard result={result} onReset={reset} />
        )}
      </div>
    </main>
  );
}

// ── FileInput component ───────────────────────────────────────────
import { forwardRef } from "react";

interface FileInputProps {
  id: string;
  label: string;
  icon: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  error?: string;
}

const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  ({ id, label, icon, accept, file, onChange, error }, ref) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {icon} {label}
      </label>
      <label
        htmlFor={id}
        className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
          error
            ? "border-red-400 bg-red-50"
            : file
            ? "border-green-400 bg-green-50"
            : "border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50"
        }`}
      >
        <span className="text-2xl">{file ? "✅" : "📁"}</span>
        <span className={`text-sm truncate ${file ? "text-green-700 font-medium" : "text-gray-400"}`}>
          {file ? file.name : "PDF o imagen (máx. 10 MB)"}
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          ref={ref}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  )
);
FileInput.displayName = "FileInput";
