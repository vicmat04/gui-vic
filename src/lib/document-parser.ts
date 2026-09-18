// ──────────────────────────────────────────────────────────────────
// Document Parser — server-side document parsing
// Extracts clean text from digital PDFs or encodes images to base64
// ──────────────────────────────────────────────────────────────────

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
      const data = new Uint8Array(arrayBuffer);
      const loadingTask = getDocument({
        data,
        useSystemFonts: true,
        disableFontFace: true,
      });
      const doc = await loadingTask.promise;

      let fullText = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageText = content.items.map((item: any) => item.str).join(" ");
        fullText += `--- PÁGINA ${i} ---\n${pageText}\n`;
      }

      // If text was found in the PDF, return text content directly
      if (fullText.trim().length > 30) {
        return {
          filename: name,
          isText: true,
          textContent: fullText.trim(),
        };
      }
    } catch (pdfErr) {
      console.warn(`[document-parser] Text extraction notice for ${name}:`, pdfErr);
    }
  }

  // Fallback: treat as image / base64 binary
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = type.startsWith("image/") ? type : "image/jpeg";

  return {
    filename: name,
    isText: false,
    base64,
    mimeType,
  };
}
