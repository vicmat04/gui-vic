"use client";

import { useState, useRef } from "react";
import { validateFile, validateCedula } from "@/lib/validation";
import ResultCard from "@/components/ResultCard";
import HistoryPanel from "@/components/HistoryPanel";
import { SubmitResponse } from "@/types";

/**
 * If the file is a PDF, render the first page to a canvas and return it
 * as a JPEG Blob. Otherwise return the file unchanged.
 * Runs 100% in the browser — no server-side PDF dependency needed.
 */
async function normalizeToImage(file: File): Promise<File> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return file;
  }

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas,
    } as Parameters<typeof page.render>[0]).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
    );

    if (!blob) throw new Error("No se pudo convertir la página del PDF a imagen.");

    return new File([blob], file.name.replace(/\.pdf$/i, ".jpg"), {
      type: "image/jpeg",
    });
  } catch (pdfErr) {
    console.warn("Client-side PDF conversion failed, sending file as-is:", pdfErr);
    return file;
  }
}

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
    try {
      const body = new FormData();
      body.append("cedula", cedula);

      // Convert PDFs to JPEG images before uploading — Groq vision only accepts images
      const [normalizedPolicy, normalizedReport] = await Promise.all([
        normalizeToImage(policyFile!),
        normalizeToImage(reportFile!),
      ]);

      body.append("policy", normalizedPolicy);
      body.append("report", normalizedReport);

      const res = await fetch("/api/analyze", { method: "POST", body });
      const data: SubmitResponse = await res.json();
      setResult(data);
      setStep("result");
    } catch (err: unknown) {
      console.error("[handleSubmit error]", err);
      setResult({
        success: false,
        error: "Error de conexión o procesamiento. Verificá los archivos e intentá de nuevo.",
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
                  🪪 Número de Cédula
                </label>
                <input
                  type="text"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
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
