// ──────────────────────────────────────────────────────────────────
// GET /api/history?cedula=XXX&policyNumber=YYY
// ──────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { validateCedula } from "@/lib/validation";
import { queryHistory } from "@/lib/notion-client";
import { checkRateLimit } from "@/lib/rate-limiter";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rateResult = checkRateLimit(ip);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const cedula = (searchParams.get("cedula") ?? "").trim();
  const policyNumber = (searchParams.get("policyNumber") ?? "").trim();

  const cedulaResult = validateCedula(cedula);
  if (!cedulaResult.valid) {
    return NextResponse.json(
      { success: false, error: cedulaResult.error },
      { status: 400 }
    );
  }

  if (!policyNumber || policyNumber.length < 3) {
    return NextResponse.json(
      { success: false, error: "Número de póliza inválido." },
      { status: 400 }
    );
  }

  const cases = await queryHistory(cedula, policyNumber);
  return NextResponse.json({ success: true, cases });
}
