// ──────────────────────────────────────────────────────────────────
// Notion client — save cases, attach files, query history
// ──────────────────────────────────────────────────────────────────

import { Client } from "@notionhq/client";
import { CaseRecord } from "@/types";

let _notion: Client | null = null;
function getNotion(): Client {
  if (!_notion) {
    _notion = new Client({ auth: process.env.NOTION_API_KEY });
  }
  return _notion;
}

/**
 * Normalizes any Notion database ID string:
 * - URL: https://notion.so/workspace/Casos-Pre-Autorizaci-n-3dfea3b1572d8017b048fb9d7ac50890?v=...
 * - Slug: Casos-Pre-Autorizaci-n-3dfea3b1572d8017b048fb9d7ac50890
 * - 32 hex: 3dfea3b1572d8017b048fb9d7ac50890
 * - Formatted UUID: 3dfea3b1-572d-8017-b048-fb9d7ac50890
 * Returns formatted 8-4-4-4-12 UUID accepted by all Notion API versions.
 */
export function cleanNotionId(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const hexOnly = trimmed.replace(/\?.*$/, "").replace(/[^a-fA-F0-9]/g, "");
  if (hexOnly.length >= 32) {
    const last32 = hexOnly.slice(-32).toLowerCase();
    return `${last32.slice(0, 8)}-${last32.slice(8, 12)}-${last32.slice(12, 16)}-${last32.slice(16, 20)}-${last32.slice(20)}`;
  }
  return trimmed;
}

function getDatabaseId(): string {
  return cleanNotionId(process.env.NOTION_DATABASE_ID);
}

// ── Upload one original file to Notion (backup attachment) ────────
// Best-effort: returns null on any failure so saveCase never blocks on this.
async function uploadFileToNotion(file: File): Promise<string | null> {
  try {
    const createRes = await fetch("https://api.notion.com/v1/file_uploads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const created = await createRes.json();
    if (!createRes.ok || !created.upload_url) {
      console.error("[notion] file_uploads create failed:", created);
      return null;
    }

    // SAFETY: allowlist the upload_url host — it's server-controlled by Notion's own API
    // response, but we still refuse to fetch() an unexpected host as defense in depth.
    if (!String(created.upload_url).startsWith("https://api.notion.com/")) {
      console.error("[notion] unexpected upload_url host, aborting:", created.upload_url);
      return null;
    }

    const form = new FormData();
    form.append("file", file, file.name);
    const sendRes = await fetch(created.upload_url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
      },
      body: form,
    });
    if (!sendRes.ok) {
      console.error("[notion] file upload send failed:", await sendRes.text());
      return null;
    }
    return created.id;
  } catch (err) {
    console.error("[notion] uploadFileToNotion error:", err);
    return null;
  }
}

// ── Save a new case ───────────────────────────────────────────────
export async function saveCase(
  record: CaseRecord,
  originals?: { policyFile: File; reportFile: File }
): Promise<string> {
  const dbId = getDatabaseId();
  if (!dbId) {
    throw new Error("NOTION_DATABASE_ID no está configurado.");
  }

  const properties: Record<string, unknown> = buildProperties(record);

  if (originals) {
    const uploaded: { id: string; name: string }[] = [];
    for (const file of [originals.policyFile, originals.reportFile]) {
      const id = await uploadFileToNotion(file);
      if (id) uploaded.push({ id, name: file.name });
    }
    if (uploaded.length > 0) {
      properties["Documentos"] = {
        files: uploaded.map((f) => ({
          type: "file_upload",
          file_upload: { id: f.id },
          name: f.name,
        })),
      };
    }
  }

  try {
    const response = await getNotion().pages.create({
      parent: { database_id: dbId },
      // SAFETY: `properties` is built by buildProperties() plus an optional "Documentos"
      // files entry we add above — both match Notion's PageCreate property shape at runtime;
      // the SDK's property union type is just too narrow to express a dynamic key like this.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as any,
    });
    return response.id;
  } catch (err) {
    console.error("[notion] Error al guardar página en Notion:", err);
    throw err;
  }
}

// ── Query history by cedula + policy number ───────────────────────
export async function queryHistory(
  cedula: string,
  policyNumber: string
): Promise<CaseRecord[]> {
  const dbId = getDatabaseId();
  if (!dbId) return [];
  try {
    const response = await getNotion().databases.query({
      database_id: dbId,
      filter: {
        and: [
          { property: "Cédula", rich_text: { equals: cedula } },
          { property: "Número de Póliza", rich_text: { equals: policyNumber } },
        ],
      },
      sorts: [{ property: "Fecha", direction: "descending" }],
    });

    return response.results.map(pageToRecord);
  } catch (err) {
    console.error("[notion] queryHistory error:", err);
    return [];
  }
}

// ── Folio-based duplicate query ───────────────────────────────────
export async function queryCasesByFolio(
  cedula: string,
  folioNumber: string
): Promise<boolean> {
  const dbId = getDatabaseId();
  if (!dbId) return false;
  try {
    const response = await getNotion().databases.query({
      database_id: dbId,
      filter: {
        and: [
          { property: "Cédula", rich_text: { equals: cedula } },
          { property: "Folio", rich_text: { equals: folioNumber } },
        ],
      },
      page_size: 1,
    });
    return response.results.length > 0;
  } catch (err) {
    console.error("[notion] queryCasesByFolio error:", err);
    return false;
  }
}

// ── Signal-based duplicate query ─────────────────────────────────
export async function queryCasesBySignals(
  cedula: string,
  signals: {
    procedure: string;
    physicianOrCenter: string;
    reportDate: string;
    thresholdDays: number;
  }
): Promise<boolean> {
  const dbId = getDatabaseId();
  if (!dbId) return false;
  try {
    const reportDate = new Date(signals.reportDate);
    // Fallback if AI returned unparseable date
    if (isNaN(reportDate.getTime())) return false;

    const fromDate = new Date(reportDate);
    fromDate.setDate(fromDate.getDate() - signals.thresholdDays);

    const response = await getNotion().databases.query({
      database_id: dbId,
      filter: {
        and: [
          { property: "Cédula", rich_text: { equals: cedula } },
          { property: "Procedimiento", rich_text: { contains: signals.procedure } },
          {
            property: "Médico/Centro",
            rich_text: { contains: signals.physicianOrCenter },
          },
          { property: "Fecha", date: { on_or_after: fromDate.toISOString().slice(0, 10) } },
        ],
      },
      page_size: 1,
    });
    return response.results.length > 0;
  } catch (err) {
    console.error("[notion] queryCasesBySignals error:", err);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
// The AI may return dates as free text (e.g. "10 de enero de 2026") instead of ISO 8601.
// Notion's date property rejects anything else, so we validate before writing.
function toISODateOrNull(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function buildProperties(record: CaseRecord) {
  const dateStr = record.createdAt ? record.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return {
    Título: {
      title: [
        {
          text: {
            content: `${record.cedula} — ${record.medicalReport.procedure ?? "sin procedimiento"} — ${dateStr}`,
          },
        },
      ],
    },
    Cédula: { rich_text: [{ text: { content: sanitize(record.cedula) } }] },
    "Número de Póliza": {
      rich_text: [{ text: { content: sanitize(record.policyNumber) } }],
    },
    Veredicto: { select: { name: record.verdict } },
    Razón: { rich_text: [{ text: { content: sanitize(record.reason) } }] },
    Procedimiento: {
      rich_text: [
        {
          text: {
            content: sanitize(record.medicalReport.procedure ?? "no encontrado"),
          },
        },
      ],
    },
    "Médico/Centro": {
      rich_text: [
        {
          text: {
            content: sanitize(
              record.medicalReport.physicianOrCenter ?? "no encontrado"
            ),
          },
        },
      ],
    },
    Folio: {
      rich_text: [
        {
          text: {
            content: sanitize(record.medicalReport.folioNumber ?? ""),
          },
        },
      ],
    },
    Fecha: { date: { start: dateStr } },
    Sospechoso: { checkbox: record.suspicious ?? false },
    Error: { checkbox: record.errorState ?? false },
    Diagnóstico: {
      rich_text: [{ text: { content: sanitize(record.medicalReport.diagnosis ?? "no encontrado") } }],
    },
    Paciente: {
      rich_text: [{ text: { content: sanitize(record.medicalReport.patientName ?? "no encontrado") } }],
    },
    Asegurado: {
      rich_text: [{ text: { content: sanitize(record.policy.insuredName ?? "no encontrado") } }],
    },
    ...(toISODateOrNull(record.policy.startDate)
      ? { "Fecha Vigencia": { date: { start: toISODateOrNull(record.policy.startDate) } } }
      : {}),
    "Procedimientos Cubiertos": {
      rich_text: [{ text: { content: sanitize((record.policy.coveredProcedures ?? []).join(", ")) } }],
    },
    Exclusiones: {
      rich_text: [{ text: { content: sanitize((record.policy.exclusions ?? []).join(", ")) } }],
    },
    "Períodos de Carencia": {
      rich_text: [
        {
          text: {
            content: sanitize(
              Object.entries(record.policy.waitingPeriods ?? {})
                .map(([tipo, periodo]) => `${tipo}: ${periodo}`)
                .join(", ")
            ),
          },
        },
      ],
    },
  };
}

// Sanitize user input to prevent Notion structure injection
function sanitize(value: string): string {
  return value.slice(0, 2000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageToRecord(page: any): CaseRecord {
  const props = page.properties;
  return {
    id: page.id,
    cedula: props["Cédula"]?.rich_text?.[0]?.plain_text ?? "",
    policyNumber: props["Número de Póliza"]?.rich_text?.[0]?.plain_text ?? "",
    verdict: props["Veredicto"]?.select?.name ?? "documentos_faltantes",
    reason: props["Razón"]?.rich_text?.[0]?.plain_text ?? "",
    medicalReport: {
      patientName: props["Paciente"]?.rich_text?.[0]?.plain_text ?? null,
      procedure: props["Procedimiento"]?.rich_text?.[0]?.plain_text ?? null,
      diagnosis: props["Diagnóstico"]?.rich_text?.[0]?.plain_text ?? null,
      reportDate: null,
      physicianOrCenter:
        props["Médico/Centro"]?.rich_text?.[0]?.plain_text ?? null,
      folioNumber: props["Folio"]?.rich_text?.[0]?.plain_text ?? null,
    },
    policy: {
      policyNumber: props["Número de Póliza"]?.rich_text?.[0]?.plain_text ?? null,
      insuredName: props["Asegurado"]?.rich_text?.[0]?.plain_text ?? null,
      startDate: props["Fecha Vigencia"]?.date?.start ?? null,
      coveredProcedures:
        props["Procedimientos Cubiertos"]?.rich_text?.[0]?.plain_text
          ?.split(", ")
          .filter(Boolean) ?? [],
      exclusions:
        props["Exclusiones"]?.rich_text?.[0]?.plain_text?.split(", ").filter(Boolean) ?? [],
      waitingPeriods: {},
    },
    createdAt: props["Fecha"]?.date?.start ?? new Date().toISOString(),
    suspicious: props["Sospechoso"]?.checkbox ?? false,
    errorState: props["Error"]?.checkbox ?? false,
  };
}
