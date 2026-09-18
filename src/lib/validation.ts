// ──────────────────────────────────────────────────────────────────
// File validation — runs BEFORE any AI call
// ──────────────────────────────────────────────────────────────────

import { ValidationResult } from "@/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_SIZE_BYTES = 50; // sanity floor

export function validateFile(
  file: File,
  label: "póliza" | "informe médico"
): ValidationResult {
  if (!file || file.size === 0) {
    return { valid: false, error: `El archivo de ${label} está vacío.` };
  }

  if (file.size < MIN_SIZE_BYTES) {
    return {
      valid: false,
      error: `El archivo de ${label} parece estar corrupto (muy pequeño).`,
    };
  }

  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `El archivo de ${label} supera el límite de 10 MB.`,
    };
  }

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
    return {
      valid: false,
      error: `El archivo de ${label} debe ser PDF o imagen (JPEG, PNG, WEBP).`,
    };
  }

  return { valid: true };
}

export function validateCedula(cedula: string): ValidationResult {
  // Panamanian cédula: digits and optional hyphens, 5-15 chars
  const cleaned = cedula.replace(/\s/g, "");
  if (!/^[\d\-]{5,15}$/.test(cleaned)) {
    return {
      valid: false,
      error: "La cédula debe contener solo números y guiones (5 a 15 caracteres).",
    };
  }
  return { valid: true };
}
