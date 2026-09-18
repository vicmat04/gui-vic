"use client";

import { SubmitResponse, Verdict } from "@/types";

interface Props {
  result: SubmitResponse;
  onReset: () => void;
}

const VERDICT_CONFIG: Record<
  Verdict,
  { emoji: string; label: string; bg: string; border: string; text: string }
> = {
  preaprobado: {
    emoji: "✅",
    label: "PRE-APROBADO",
    bg: "bg-green-50",
    border: "border-green-400",
    text: "text-green-800",
  },
  documentos_faltantes: {
    emoji: "📋",
    label: "DOCUMENTOS FALTANTES",
    bg: "bg-yellow-50",
    border: "border-yellow-400",
    text: "text-yellow-800",
  },
  rechazado: {
    emoji: "❌",
    label: "RECHAZADO",
    bg: "bg-red-50",
    border: "border-red-400",
    text: "text-red-800",
  },
};

export default function ResultCard({ result, onReset }: Props) {
  if (!result.success || !result.verdict) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Ocurrió un error</h2>
        <p className="text-gray-500 text-sm mb-6">{result.error}</p>
        <button
          onClick={onReset}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  if (result.duplicate) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-5xl mb-4">🔁</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Caso duplicado detectado</h2>
        <p className="text-gray-500 text-sm mb-4">
          Este caso ya fue procesado anteriormente.
        </p>
        <p className="font-semibold text-gray-700 mb-6">
          Veredicto previo: <span className="capitalize">{result.verdict}</span>
        </p>
        <button
          onClick={onReset}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700"
        >
          Nueva consulta
        </button>
      </div>
    );
  }

  const config = VERDICT_CONFIG[result.verdict];

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Verdict banner */}
      <div className={`${config.bg} border-l-4 ${config.border} px-8 py-6`}>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-4xl">{config.emoji}</span>
          <span className={`text-xl font-bold ${config.text}`}>{config.label}</span>
        </div>
        {result.caseId && (
          <p className="text-xs text-gray-400 mt-1">Caso ID: {result.caseId}</p>
        )}
      </div>

      {/* Reason */}
      <div className="px-8 py-6 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Fundamento de la decisión
        </h3>
        <p className="text-gray-800 leading-relaxed">{result.reason}</p>
      </div>

      {/* Suspicious badge */}
      {result.suspicious && (
        <div className="px-8 py-4 bg-orange-50 border-l-4 border-orange-400">
          <p className="text-orange-700 text-sm font-medium">
            ⚠️ Este caso fue marcado para <strong>revisión manual</strong>: la
            decisión automática difiere de la verificación cruzada del sistema.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-8 py-6">
        <button
          onClick={onReset}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          Nueva consulta
        </button>
      </div>
    </div>
  );
}
