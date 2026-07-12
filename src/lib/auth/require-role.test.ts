// Unit-test voor het token-loze pad van requireRole (wayfinder-ticket 006).
//
// Keuze: een ECHTE unit-test (geen livetest), zonder mocks. Een NextRequest zonder
// Authorization-header en zonder cookies geeft GoTrue geen access_token door — de
// GoTrueClient kort dan lokaal af (`AuthSessionMissingError`, geen HTTP-fetch), zie
// `_getUser()` in @supabase/auth-js: zonder sessie/jwt retourneert die synchroon
// `{ data: { user: null }, error: AuthSessionMissingError }`. Geverifieerd door dit
// los te draaien (~25ms, geen netwerkvertraging) vóór deze test geschreven werd.
// We zetten wél dummy env-vars (geen mock — puur config) omdat requireRole een
// geldige Supabase-URL nodig heeft om de client te construeren.
import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "./require-role";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
});

describe("requireRole — geen Authorization-header en geen cookies", () => {
  it("geeft 401 met Nederlandse foutmelding, zonder netwerkcall", async () => {
    const req = new NextRequest(new Request("http://localhost/api/invoices/credit", { method: "POST" }));

    const result = await requireRole(req, ["sales", "admin"]);

    expect(result).toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) throw new Error("verwacht NextResponse");
    expect(result.status).toBe(401);
    const body = await result.json();
    expect(body).toEqual({ error: "Niet ingelogd" });
  });
});
