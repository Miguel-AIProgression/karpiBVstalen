# Samenstellen pagina: Uitvouwbare tabellen

**Datum:** 2026-03-20
**Status:** Ontwerp goedgekeurd
**Pagina:** `/management/compose`

## Samenvatting

De drie tabs op de Samenstellen-pagina (Producten, Bundels, Collecties) worden omgebouwd van kaart/badge-weergave naar uitvouwbare tabellen. Dit maakt de hiërarchische data (kwaliteit → kleuren, bundel → kleuren, collectie → bundels → kleuren) overzichtelijker en beter bewerkbaar.

## Doelen

1. Overzichtelijker: hiërarchie direct zichtbaar via uitvouwbare rijen
2. Werkplek voor samenstellen: collecties inline samenstellen met bestaande bundels
3. Consistente UI: alle drie de tabs gebruiken hetzelfde tabelpatroon
4. Inline CRUD: bewerken zonder modals of drawers

## Ontwerp per tab

### Producten-tab (read-only)

**Tabelkolommen:** `[▸] Kwaliteit | Code | Kleuren | Status`

- Rij per actieve kwaliteit
- Uitvouwen toont kleurcodes als pills/chips (code + naam)
- Geen bewerkfunctionaliteit (read-only overzicht)

### Bundels-tab (CRUD)

**Tabelkolommen:** `[▸] Bundel | Kwaliteit | Maat | Kleuren | Acties`

- Rij per actieve bundel
- Uitvouwen toont kleuren als genummerde pills (volgorde = positie)
- **Edit-modus** (klik ✎):
  - Naam wordt input-veld
  - Kwaliteit en maat worden dropdowns
  - Kleuren worden draggable pills met ✕ en "+ Kleur toevoegen"
  - Opslaan/Annuleer knoppen inline
  - Max één rij tegelijk in edit-modus
- **Nieuwe bundel:** "Nieuwe bundel toevoegen" rij onderaan → voegt lege bewerkbare rij toe
- **Deactiveren:** 🗑 knop → bevestigingsdialog → soft delete (active=false)

### Collecties-tab (CRUD + samenstellen)

**Tabelkolommen:** `[▸] Collectie / Bundel | Bundels | Kleuren | Acties`

- **Niveau 1:** Collectie-rij met bundel- en kleurenaantallen
- **Niveau 2:** Bundel-rijen (ingesprongen), uitvouwbaar naar kleuren
- **Niveau 3:** Kleuren als pills

- **Edit-modus** (klik ✎ op collectie):
  - Naam en beschrijving worden editable
  - ✕ knop bij elke bundel-rij om te verwijderen uit collectie
  - Opslaan/Annuleer knoppen inline
- **Bundels toevoegen:** Inline zoek-dropdown onder de bundel-lijst
  - Filtert op bundelnaam, kwaliteitscode
  - Geselecteerde bundel wordt direct toegevoegd
- **Nieuwe bundel nodig?** Link "Nieuwe bundel aanmaken →" navigeert naar Bundels-tab
- **Nieuwe collectie:** "Nieuwe collectie toevoegen" rij onderaan
- **Deactiveren:** 🗑 knop → bevestigingsdialog → soft delete (active=false)

## Interactiepatronen

### Uitvouwen/invouwen
- Klik op rij of chevron (▸/▾) om te togglen
- Meerdere rijen tegelijk open mogelijk
- Staat wordt niet bewaard bij tab-wissel

### Inline bewerken
- Max één rij tegelijk in edit-modus
- Achtergrondkleur verandert subtiel (#fffbf5) om edit-modus aan te duiden
- Opslaan schrijft direct naar Supabase
- Annuleren herstelt originele waarden

### Toevoegen
- "+ Nieuwe [item]" rij onderaan elke tabel
- Opent een lege rij in edit-modus

### Deactiveren
- Bevestigingsdialog voorkomt per-ongeluk verwijderen
- Soft delete: `active = false`
- Gedeactiveerde items verdwijnen uit de lijst

## Technische aanpak

### Bestandswijzigingen
- **Primair:** `src/app/management/compose/page.tsx` — volledige herschrijving van de tab-content
- **Hergebruik:** Bestaande Supabase queries en interfaces (Bundle, Collection) als basis
- **Componenten:** Overweeg extractie van een generiek `<ExpandableTable>` component als de drie tabs voldoende overlap hebben

### Data-flow
- Bestaande fetch-logica voor bundels en collecties blijft grotendeels intact
- Producten-tab: query op `qualities` + `color_codes` (al beschikbaar)
- Bundels-tab: bestaande bundel-fetch + CRUD operaties
- Collecties-tab: bestaande collectie-fetch + `collection_bundles` mutaties
- Bundel-zoek in collecties: client-side filter op al geladen bundels

### Geen database-wijzigingen nodig
Alle benodigde tabellen en relaties bestaan al:
- `bundles`, `bundle_colors` (met position)
- `collections`, `collection_bundles`
- `qualities`, `color_codes`, `sample_dimensions`
