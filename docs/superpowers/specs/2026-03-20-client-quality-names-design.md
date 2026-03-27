# Client Quality Names Import — Design Spec

**Date:** 2026-03-20
**Source data:** TKA013_Overzicht_20260319104204.xls (~6800 rijen)

## Context

Thom ten Brinke (Karpi B.V.) leverde een XLS export aan met klant-eigen-namen per kwaliteit.
Elke klant geeft Karpi-kwaliteiten een eigen naam (bijv. klant "AD BOUW" noemt BEACH LIFE → "BREDA").
Deze namen worden later gebruikt op stickers bij staaltjesbestellingen.

## Kolommen in bronbestand

| Kolom | Veld | Voorbeeld |
|---|---|---|
| A | Klant/Inkoopcomb. (klantnummer) | 100004 |
| B | Naam (bedrijfsnaam) | AD BOUW |
| C | Kwaliteit (afkorting) | BEAC |
| D | Benaming (klant-eigen-naam) | BREDA |
| E | Omschrijving (Karpi-naam) | BEACH LIFE |
| F | Leverancier (genegeerd) | 024001 |

## Database wijzigingen

### Migration 1: `client_number` op `clients`

```sql
ALTER TABLE clients ADD COLUMN client_number text UNIQUE;
```

### Migration 2: Nieuwe tabel `client_quality_names`

```sql
CREATE TABLE client_quality_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  quality_id uuid NOT NULL REFERENCES qualities(id) ON DELETE CASCADE,
  custom_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, quality_id)
);
```

## Import stappen

1. Unieke kwaliteitscodes + Karpi-namen extraheren → bestaande `qualities.name` updaten, nieuwe qualities aanmaken
2. Unieke klanten (nummer + naam) → inserten in `clients` met `client_number`
3. Alle klant-kwaliteit-naam combinaties → inserten in `client_quality_names`

## Scope

- Qualities: name updaten van afkorting naar volledige Karpi-naam + nieuwe aanmaken
- Clients: aanmaken met client_number en bedrijfsnaam
- Client quality names: klant-eigen-namen per kwaliteit opslaan
- TypeScript types updaten
- Database docs updaten

## Buiten scope

- Frontend wijzigingen (klantpagina's blijven stubs)
- Leverancierscode importeren
- Prijzen importeren
