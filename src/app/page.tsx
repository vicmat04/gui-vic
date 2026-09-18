"use client";

import { useState, useRef, forwardRef } from "react";
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
      newErrors.policy = "Adjuntá la póliza del paciente (PDF o imagen).";
    } else {
      const pCheck = validateFile(policyFile, "póliza");
      if (!pCheck.valid) newErrors.policy = pCheck.error!;
    }

    if (!reportFile) {
      newErrors.report = "Adjuntá el informe médico (PDF o imagen).";
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
    try {
      const body = new FormData();
      body.append("cedula", cedula);
      body.append("policy", policyFile!);
      body.append("report", reportFile!);

      const res = await fetch("/api/analyze", { method: "POST", body });
      const data: SubmitResponse = await res.json();
      setResult(data);
      setStep("result");
    } catch (err: unknown) {
      console.error("[handleSubmit error]", err);
      setResult({
        success: false,
        error: "Error de conexión o procesamiento. Verificá tu red e intentá de nuevo.",
      });
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg text-white text-3xl">
            🏥
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Pre-Autorización Quirúrgica</h1>
          <p className="text-gray-500 mt-2">Sistema inteligente de análisis de cobertura en tiempo real</p>
        </div>

        {/* Form */}
        {step === "form" && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Cédula */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  🪪 Número de Cédula
                </label>
                <input
                  type="text"
                  value={cedula}
                  onChange={(e) => {
                    setCedula(e.target.value);
                    if (errors.cedula) {
                      setErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.cedula;
                        return copy;
                      });
                    }
                  }}
                  placeholder="Ej: 8-888-8888"
                  autoFocus
                  className={`w-full px-5 py-4 rounded-xl border-2 transition-all outline-none
                    text-gray-900 text-lg font-semibold tracking-widest
                    placeholder:text-gray-300 placeholder:font-normal placeholder:tracking-normal
                    focus:ring-4 focus:ring-blue-100
                    ${
                      errors.cedula
                        ? "border-red-400 bg-red-50"
                        : cedula
                        ? "border-blue-500 bg-blue-50 shadow-inner"
                        : "border-gray-300 hover:border-blue-300 focus:border-blue-500"
                    }`}
                />
                {cedula && !errors.cedula && (
                  <p className="text-blue-500 text-xs mt-1 font-medium">✓ Cédula ingresada</p>
                )}
                {errors.cedula && (
                  <p className="text-red-500 text-sm mt-1">{errors.cedula}</p>
                )}
              </div>

              {/* Póliza */}
              <FileInput
                id="policy"
                label="Póliza del Paciente"
                icon="📄"
                accept=".pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp"
                file={policyFile}
                onChange={(f) => {
                  setPolicyFile(f);
                  if (errors.policy) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.policy;
                      return next;
                    });
                  }
                }}
                error={errors.policy}
                ref={policyRef}
              />

              {/* Informe médico */}
              <FileInput
                id="report"
                label="Informe Médico"
                icon="🩺"
                accept=".pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp"
                file={reportFile}
                onChange={(f) => {
                  setReportFile(f);
                  if (errors.report) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.report;
                      return next;
                    });
                  }
                }}
                error={errors.report}
                ref={reportRef}
              />

              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition-all duration-150 shadow-md hover:shadow-lg cursor-pointer"
              >
                Analizar Documentos
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-blue-600 hover:underline text-sm font-medium cursor-pointer"
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
              La IA está extrayendo información y verificando cobertura, exclusiones y período de carencia.
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
      <span className="block text-sm font-semibold text-gray-700 mb-2">
        {icon} {label}
      </span>
      <label
        htmlFor={id}
        className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
          error
            ? "border-red-400 bg-red-50"
            : file
            ? "border-green-400 bg-green-50"
            : "border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50"
        }`}
      >
        <span className="text-2xl">{file ? "✅" : "📁"}</span>
        <span
          className={`text-sm truncate flex-1 ${
            file ? "text-green-800 font-semibold" : "text-gray-500"
          }`}
        >
          {file ? file.name : "Seleccionar PDF o imagen (máx. 10 MB)"}
        </span>
        {file && (
          <span className="text-xs bg-green-200 text-green-800 px-2.5 py-1 rounded-md font-semibold">
            {(file.size / 1024).toFixed(0)} KB
          </span>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        ref={ref}
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          onChange(selected);
        }}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  )
);
FileInput.displayName = "FileInput";
