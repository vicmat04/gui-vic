// ──────────────────────────────────────────────────────────────────
// Notion client — save cases, attach files, query history
// ──────────────────────────────────────────────────────────────────

import { Client } from "@notionhq/client";
import { CaseRecord } from "@/types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

// ── Save a new case ───────────────────────────────────────────────
export async function saveCase(record: CaseRecord): Promise<string> {
  const response = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: buildProperties(record),
  });
  return response.id;
}

// ── Query history by cedula + policy number ───────────────────────
export async function queryHistory(
  cedula: string,
  policyNumber: string
): Promise<CaseRecord[]> {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: "Cédula", rich_text: { equals: cedula } },
        { property: "Número de Póliza", rich_text: { equals: policyNumber } },
      ],
    },
    sorts: [{ property: "Fecha", direction: "descending" }],
  });

  return response.results.map(pageToRecord);
}

// ── Folio-based duplicate query ───────────────────────────────────
export async function queryCasesByFolio(
  cedula: string,
  folioNumber: string
): Promise<boolean> {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: "Cédula", rich_text: { equals: cedula } },
        { property: "Folio", rich_text: { equals: folioNumber } },
      ],
    },
    page_size: 1,
  });
  return response.results.length > 0;
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
  const reportDate = new Date(signals.reportDate);
  const fromDate = new Date(reportDate);
  fromDate.setDate(fromDate.getDate() - signals.thresholdDays);

  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: "Cédula", rich_text: { equals: cedula } },
        { property: "Procedimiento", rich_text: { contains: signals.procedure } },
        {
          property: "Médico/Centro",
          rich_text: { contains: signals.physicianOrCenter },
        },
        { property: "Fecha", date: { on_or_after: fromDate.toISOString() } },
      ],
    },
    page_size: 1,
  });
  return response.results.length > 0;
}

// ── Helpers ───────────────────────────────────────────────────────
function buildProperties(record: CaseRecord) {
  return {
    Título: {
      title: [
        {
          text: {
            content: `${record.cedula} — ${record.medicalReport.procedure ?? "sin procedimiento"} — ${record.createdAt}`,
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
    Fecha: { date: { start: record.createdAt } },
    Sospechoso: { checkbox: record.suspicious ?? false },
    Error: { checkbox: record.errorState ?? false },
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
      patientName: null,
      procedure: props["Procedimiento"]?.rich_text?.[0]?.plain_text ?? null,
      diagnosis: null,
      reportDate: null,
      physicianOrCenter:
        props["Médico/Centro"]?.rich_text?.[0]?.plain_text ?? null,
      folioNumber: props["Folio"]?.rich_text?.[0]?.plain_text ?? null,
    },
    policy: {
      policyNumber: props["Número de Póliza"]?.rich_text?.[0]?.plain_text ?? null,
      insuredName: null,
      startDate: null,
      coveredProcedures: [],
      exclusions: [],
      waitingPeriods: {},
    },
    createdAt: props["Fecha"]?.date?.start ?? new Date().toISOString(),
    suspicious: props["Sospechoso"]?.checkbox ?? false,
    errorState: props["Error"]?.checkbox ?? false,
  };
}
