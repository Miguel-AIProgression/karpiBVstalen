import { describe, it, expect } from "vitest";
import { checkInvoiceDeletable } from "./invoice-delete-guard";

describe("checkInvoiceDeletable", () => {
  it("staat verwijderen toe als de factuur niet gemaild is en geen creditnota's heeft", () => {
    const verdict = checkInvoiceDeletable({ sentAt: null, hasCreditNotes: false });
    expect(verdict).toEqual({ allowed: true });
  });

  it("blokkeert verwijderen van een gemailde factuur", () => {
    const verdict = checkInvoiceDeletable({ sentAt: "2026-07-01T10:00:00Z", hasCreditNotes: false });
    expect(verdict).toEqual({
      allowed: false,
      status: 409,
      error: "Gemailde factuur kan niet verwijderd worden — crediteer in plaats daarvan.",
    });
  });

  it("blokkeert verwijderen van een factuur met creditnota's, ook als sentAt null is", () => {
    const verdict = checkInvoiceDeletable({ sentAt: null, hasCreditNotes: true });
    expect(verdict).toEqual({
      allowed: false,
      status: 409,
      error: "Deze factuur heeft creditnota's en kan niet verwijderd worden.",
    });
  });

  it("geeft de sentAt-fout als zowel sentAt als hasCreditNotes gelden (sentAt-check gaat eerst)", () => {
    const verdict = checkInvoiceDeletable({ sentAt: "2026-07-01T10:00:00Z", hasCreditNotes: true });
    expect(verdict).toEqual({
      allowed: false,
      status: 409,
      error: "Gemailde factuur kan niet verwijderd worden — crediteer in plaats daarvan.",
    });
  });
});
