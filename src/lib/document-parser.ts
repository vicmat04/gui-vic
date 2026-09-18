// ──────────────────────────────────────────────────────────────────
// Document Parser — server-side document parsing
// Extracts clean text from digital PDFs or encodes images to base64
// ──────────────────────────────────────────────────────────────────

// @ts-expect-error - pdf-parse has no default export in its types but works at runtime
import pdfParse from "pdf-parse";

export interface ParsedDocument {
  filename: string;
  isText: boolean;
  textContent?: string;
  base64?: string;
  mimeType?: string;
}

/**
 * Extracts plain text from a PDF or prepares an image for multimodal analysis.
 * Runs 100% in Node.js serverless runtime — no browser or canvas dependencies.
 */
export async function parseUploadedDocument(file: File): Promise<ParsedDocument> {
  const name = file.name || "documento";
  const type = (file.type || "").toLowerCase();
  const isPdf =
    type === "application/pdf" ||
    type.includes("pdf") ||
    name.toLowerCase().endsWith(".pdf");

  const arrayBuffer = await file.arrayBuffer();

  if (isPdf) {
    try {
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdfParse(buffer);

      // If text was found in the PDF, return text content directly
      if (data.text && data.text.trim().length > 30) {
        return {
          filename: name,
          isText: true,
          textContent: data.text.trim(),
        };
      }
    } catch (pdfErr) {
      console.warn(`[document-parser] Text extraction notice for ${name}:`, pdfErr);
    }
  }

  // Fallback: treat as image / base64 binary
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = isPdf ? "application/pdf" : (type.startsWith("image/") ? type : "image/jpeg");

  return {
    filename: name,
    isText: false,
    base64,
    mimeType,
  };
}
