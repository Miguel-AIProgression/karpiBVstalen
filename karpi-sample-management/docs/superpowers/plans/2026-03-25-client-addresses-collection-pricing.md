# Client Addresses & Collection Pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-address management to clients (with primary address), shipping address selection/override in order creation, and collection-level pricing that can be overridden per order.

**Architecture:** A new `client_addresses` table stores multiple addresses per client with an `is_primary` flag. Collections get a `price_cents` column. Orders snapshot the chosen shipping address + collection price at creation time. The order creation modal gains a new step (3 of 5) where users pick/edit the shipping address and adjust the collection price. The client detail page gets an "Adressen" tab for managing addresses.

**Tech Stack:** Supabase (SQL via curl), Next.js, TypeScript, Tailwind CSS, shadcn/ui

---

## File Structure

### Database (via Supabase SQL)
- **New table:** `client_addresses` — stores multiple addresses per client
- **Alter:** `collections` — add `price_cents` column
- **Alter:** `orders` — add shipping address snapshot + `collection_price_cents`

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/supabase/types.ts` | Add `client_addresses` table, `price_cents` to `collections`, shipping fields to `orders` |
| `src/app/(app)/klanten/[id]/page.tsx` | Add "Adressen" tab for managing multiple client addresses |
| `src/app/(app)/collecties/page.tsx` | Add price display + inline editing to collections |
| `src/components/order-create-modal.tsx` | Add step 3 (address dropdown + price), shift steps 3→4, 4→5 |
| `src/app/(app)/orders/[id]/page.tsx` | Show shipping address + collection price on order detail |

---

## Task 1: Database — Create `client_addresses` table

**Files:**
- Create: Supabase table via SQL (curl)
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Run SQL to create client_addresses table**

```sql
CREATE TABLE IF NOT EXISTS client_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Hoofdadres',
  street text,
  postal_code text,
  city text,
  country text DEFAULT 'Nederland',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups by client
CREATE INDEX IF NOT EXISTS idx_client_addresses_client_id ON client_addresses(client_id);

-- Ensure only one primary address per client via a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_addresses_primary
  ON client_addresses(client_id) WHERE is_primary = true;

-- RLS: same policy as clients (authenticated users can read, admin can write)
ALTER TABLE client_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read client_addresses"
  ON client_addresses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert client_addresses"
  ON client_addresses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update client_addresses"
  ON client_addresses FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete client_addresses"
  ON client_addresses FOR DELETE
  TO authenticated
  USING (true);
```

Run via curl against Supabase. Use the SQL editor endpoint or the `psql` connection string from `.env.local`.

- [ ] **Step 2: Verify table exists**

```bash
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_addresses?limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Should return `[]` (empty array, no error).

- [ ] **Step 3: Update types.ts — add client_addresses table**

In `src/lib/supabase/types.ts`, add inside `Tables`:

```typescript
client_addresses: {
  Row: { id: string; client_id: string; label: string; street: string | null; postal_code: string | null; city: string | null; country: string | null; is_primary: boolean; created_at: string; updated_at: string };
  Insert: { id?: string; client_id: string; label?: string; street?: string | null; postal_code?: string | null; city?: string | null; country?: string | null; is_primary?: boolean };
  Update: { client_id?: string; label?: string; street?: string | null; postal_code?: string | null; city?: string | null; country?: string | null; is_primary?: boolean };
  Relationships: [];
};
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add client_addresses table type definitions"
```

---

## Task 2: Database — Add `price_cents` to `collections`

**Files:**
- Modify: Supabase database via SQL
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Run SQL migration**

```sql
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS price_cents integer;
```

`price_cents` is nullable — `NULL` means "no price set", `0` means free. Stores euros in cents (e.g., 2500 = €25,00).

- [ ] **Step 2: Verify column exists**

Query collections and check for `price_cents`.

- [ ] **Step 3: Update types.ts — collections table**

Add `price_cents: number | null` to `Row`, `price_cents?: number | null` to `Insert`, `price_cents?: number | null` to `Update`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add price_cents to collections table"
```

---

## Task 3: Database — Add shipping address + price to `orders`

**Files:**
- Modify: Supabase database via SQL
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Run SQL migration**

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_country text,
  ADD COLUMN IF NOT EXISTS collection_price_cents integer;
```

These are snapshots from the selected client address + collection price at order creation time.

- [ ] **Step 2: Verify columns exist**

- [ ] **Step 3: Update types.ts — orders table**

Add to `Row`:
```typescript
shipping_street: string | null;
shipping_postal_code: string | null;
shipping_city: string | null;
shipping_country: string | null;
collection_price_cents: number | null;
```

Add to `Insert`:
```typescript
shipping_street?: string | null;
shipping_postal_code?: string | null;
shipping_city?: string | null;
shipping_country?: string | null;
collection_price_cents?: number | null;
```

Add to `Update`:
```typescript
shipping_street?: string | null;
shipping_postal_code?: string | null;
shipping_city?: string | null;
shipping_country?: string | null;
collection_price_cents?: number | null;
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat: add shipping address and collection price to orders table"
```

---

## Task 4: UI — Client addresses tab on detail page

**Files:**
- Modify: `src/app/(app)/klanten/[id]/page.tsx`

This adds a new "Adressen" tab to the client detail page where users can manage multiple addresses per client.

- [ ] **Step 1: Add AddressRow interface**

```typescript
interface AddressRow {
  id: string;
  client_id: string;
  label: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  is_primary: boolean;
}
```

- [ ] **Step 2: Add "adressen" to TabKey**

```typescript
type TabKey = "adressen" | "eigen-namen" | "prijzen" | "orders";
```

Set default active tab to `"adressen"`.

- [ ] **Step 3: Add state for addresses**

```typescript
// Adressen
const [addresses, setAddresses] = useState<AddressRow[]>([]);
const [showAddressForm, setShowAddressForm] = useState(false);
const [addressLabel, setAddressLabel] = useState("Hoofdadres");
const [addressStreet, setAddressStreet] = useState("");
const [addressPostalCode, setAddressPostalCode] = useState("");
const [addressCity, setAddressCity] = useState("");
const [addressCountry, setAddressCountry] = useState("Nederland");
const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
```

- [ ] **Step 4: Add loadAddresses function**

```typescript
const loadAddresses = useCallback(async () => {
  const { data } = await supabase
    .from("client_addresses")
    .select("*")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("label");
  setAddresses((data as AddressRow[]) ?? []);
}, [supabase, clientId]);
```

Call it in the same `useEffect` that loads other data.

- [ ] **Step 5: Add address CRUD functions**

```typescript
async function handleAddAddress() {
  const { error } = await supabase.from("client_addresses").insert({
    client_id: clientId,
    label: addressLabel.trim() || "Hoofdadres",
    street: addressStreet.trim() || null,
    postal_code: addressPostalCode.trim() || null,
    city: addressCity.trim() || null,
    country: addressCountry.trim() || null,
    is_primary: addresses.length === 0, // First address is automatically primary
  });
  if (!error) {
    resetAddressForm();
    await loadAddresses();
  }
}

async function handleDeleteAddress(id: string) {
  await supabase.from("client_addresses").delete().eq("id", id);
  await loadAddresses();
}

async function handleSetPrimary(id: string) {
  // Remove primary from all, then set on the chosen one
  // The unique partial index enforces only one primary, so we must unset first
  await supabase
    .from("client_addresses")
    .update({ is_primary: false })
    .eq("client_id", clientId);
  await supabase
    .from("client_addresses")
    .update({ is_primary: true })
    .eq("id", id);
  await loadAddresses();
}

async function handleUpdateAddress(id: string) {
  await supabase.from("client_addresses").update({
    label: addressLabel.trim() || "Hoofdadres",
    street: addressStreet.trim() || null,
    postal_code: addressPostalCode.trim() || null,
    city: addressCity.trim() || null,
    country: addressCountry.trim() || null,
  }).eq("id", id);
  setEditingAddressId(null);
  resetAddressForm();
  await loadAddresses();
}

function resetAddressForm() {
  setShowAddressForm(false);
  setAddressLabel("Hoofdadres");
  setAddressStreet("");
  setAddressPostalCode("");
  setAddressCity("");
  setAddressCountry("Nederland");
  setEditingAddressId(null);
}

function startEditAddress(addr: AddressRow) {
  setEditingAddressId(addr.id);
  setAddressLabel(addr.label);
  setAddressStreet(addr.street ?? "");
  setAddressPostalCode(addr.postal_code ?? "");
  setAddressCity(addr.city ?? "");
  setAddressCountry(addr.country ?? "Nederland");
  setShowAddressForm(true);
}
```

- [ ] **Step 6: Add the "Adressen" tab button to the tab bar**

Add it as the first tab in the tab bar:
```tsx
<button onClick={() => setActiveTab("adressen")} className={...}>
  Adressen
</button>
```

- [ ] **Step 7: Build the Adressen tab content**

```tsx
{activeTab === "adressen" && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-card-foreground">Adressen</h3>
      <Button size="sm" onClick={() => { resetAddressForm(); setShowAddressForm(true); }}>
        <Plus size={14} /> Adres toevoegen
      </Button>
    </div>

    {/* Add/Edit form */}
    {showAddressForm && (
      <div className="rounded-lg bg-muted/50 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Label</label>
            <Input value={addressLabel} onChange={(e) => setAddressLabel(e.target.value)} placeholder="Bijv. Hoofdkantoor, Magazijn..." />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Straat + huisnr.</label>
            <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Kerkstraat 1" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Postcode</label>
            <Input value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} placeholder="1234 AB" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Plaats</label>
            <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="Amsterdam" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Land</label>
            <Input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} placeholder="Nederland" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={resetAddressForm}>Annuleren</Button>
          {editingAddressId ? (
            <Button size="sm" onClick={() => handleUpdateAddress(editingAddressId)}>Opslaan</Button>
          ) : (
            <Button size="sm" onClick={handleAddAddress}>Toevoegen</Button>
          )}
        </div>
      </div>
    )}

    {/* Address list */}
    {addresses.length === 0 ? (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nog geen adressen. Voeg een adres toe.
      </p>
    ) : (
      <div className="space-y-2">
        {addresses.map((addr) => (
          <div key={addr.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-card-foreground">{addr.label}</span>
                {addr.is_primary && (
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Standaard
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[addr.street, addr.postal_code, addr.city, addr.country].filter(Boolean).join(", ") || "Geen adres ingevuld"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!addr.is_primary && (
                <button onClick={() => handleSetPrimary(addr.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Maak standaard">
                  <Check size={14} />
                </button>
              )}
              <button onClick={() => startEditAddress(addr)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Bewerken">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDeleteAddress(addr.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" title="Verwijderen">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 8: Test manually** — Add multiple addresses to a client, set primary, edit, delete. Verify the primary constraint works.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/klanten/\[id\]/page.tsx
git commit -m "feat: add multi-address management tab to client detail page"
```

---

## Task 5: UI — Collection price on collecties page

**Files:**
- Modify: `src/app/(app)/collecties/page.tsx`

- [ ] **Step 1: Update collection interface**

Find the `CollectionData` interface (or equivalent) and add `price_cents: number | null`.

- [ ] **Step 2: Include `price_cents` in the Supabase select query for collections**

The current query uses `select("*, collection_bundles(...)")` — the `*` will include `price_cents` automatically, so just update the TypeScript interface.

- [ ] **Step 3: Display the price next to collection name**

In the collection list item, show the price alongside existing info:
```tsx
<span className="text-xs text-muted-foreground">
  {c.price_cents != null && c.price_cents > 0
    ? `€${(c.price_cents / 100).toFixed(2)}`
    : "Geen prijs"}
</span>
```

- [ ] **Step 4: Add inline price editing**

When a collection row is expanded, add a price input. Use a **string state** for the input to avoid UX issues with `toFixed`:

```typescript
const [editPriceInput, setEditPriceInput] = useState("");
const [editPriceCollectionId, setEditPriceCollectionId] = useState<string | null>(null);
```

When starting to edit:
```typescript
setEditPriceInput(c.price_cents != null ? (c.price_cents / 100).toFixed(2) : "");
setEditPriceCollectionId(c.id);
```

The input:
```tsx
<div className="space-y-1">
  <label className="text-xs text-muted-foreground">Collectieprijs (€)</label>
  <div className="flex items-center gap-2">
    <Input
      type="number"
      step="0.01"
      min="0"
      value={editPriceInput}
      onChange={(e) => setEditPriceInput(e.target.value)}
      placeholder="0.00"
      className="max-w-[120px]"
    />
    <Button size="sm" onClick={() => handleSavePrice(c.id)}>
      <Check size={14} />
    </Button>
  </div>
</div>
```

Save function:
```typescript
async function handleSavePrice(collectionId: string) {
  const cents = Math.round(parseFloat(editPriceInput || "0") * 100);
  await supabase.from("collections").update({
    price_cents: cents > 0 ? cents : null,
  }).eq("id", collectionId);
  setEditPriceCollectionId(null);
  await loadCollections(); // or however collections are reloaded
}
```

- [ ] **Step 5: Test manually** — Set a price on a collection, verify it persists after reload.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/collecties/page.tsx
git commit -m "feat: add collection price editing to collecties page"
```

---

## Task 6: UI — Order create modal with address dropdown + price step

**Files:**
- Modify: `src/components/order-create-modal.tsx`

The modal goes from 4 steps to 5:
1. Kies klant (existing)
2. Kies collectie (existing)
3. **Verzendadres & collectieprijs (NEW)**
4. Levertijd (was step 3)
5. Bevestig (was step 4)

- [ ] **Step 1: Add AddressOption interface**

```typescript
interface AddressOption {
  id: string;
  label: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  is_primary: boolean;
}
```

- [ ] **Step 2: Update CollectionOption interface**

Add price:
```typescript
interface CollectionOption {
  id: string;
  name: string;
  bundle_count: number;
  price_cents: number | null;
}
```

- [ ] **Step 3: Update step type from `1|2|3|4` to `1|2|3|4|5`**

```typescript
const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
```

- [ ] **Step 4: Add state for addresses, selected address, price**

```typescript
// Step 3: Verzendadres & collectieprijs
const [clientAddresses, setClientAddresses] = useState<AddressOption[]>([]);
const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
const [shippingStreet, setShippingStreet] = useState("");
const [shippingPostalCode, setShippingPostalCode] = useState("");
const [shippingCity, setShippingCity] = useState("");
const [shippingCountry, setShippingCountry] = useState("Nederland");
const [collectionPriceInput, setCollectionPriceInput] = useState("");
```

Note: `collectionPriceInput` is a string to avoid toFixed UX bugs.

- [ ] **Step 5: Add loadClientAddresses function**

```typescript
const loadClientAddresses = useCallback(async (clientId: string) => {
  const { data } = await supabase
    .from("client_addresses")
    .select("id, label, street, postal_code, city, country, is_primary")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("label");
  const addresses = (data as AddressOption[]) ?? [];
  setClientAddresses(addresses);

  // Auto-select the primary address
  const primary = addresses.find((a) => a.is_primary) ?? addresses[0];
  if (primary) {
    setSelectedAddressId(primary.id);
    setShippingStreet(primary.street ?? "");
    setShippingPostalCode(primary.postal_code ?? "");
    setShippingCity(primary.city ?? "");
    setShippingCountry(primary.country ?? "Nederland");
  }
}, [supabase]);
```

- [ ] **Step 6: Update loadCollections to include price_cents**

Make sure the select query includes `price_cents`:
```typescript
.select("id, name, price_cents, collection_bundles(id)")
```

And the mapping:
```typescript
price_cents: c.price_cents ?? null,
```

- [ ] **Step 7: Load addresses when client is selected (step 1 → 2 transition)**

When a client is clicked:
```typescript
onClick={() => {
  setSelectedClient(c);
  loadClientAddresses(c.id);
  setStep(2);
}}
```

- [ ] **Step 8: Pre-fill price when collection is selected (step 2 → 3 transition)**

When a collection is clicked:
```typescript
onClick={() => {
  setSelectedCollection(c);
  setCollectionPriceInput(
    c.price_cents != null && c.price_cents > 0
      ? (c.price_cents / 100).toFixed(2)
      : ""
  );
  setStep(3);
}}
```

- [ ] **Step 9: Build new step 3 UI — Verzendadres & collectieprijs**

```tsx
{step === 3 && (
  <div className="space-y-4">
    {/* Address selection */}
    <div>
      <h3 className="text-sm font-semibold text-card-foreground mb-2">Verzendadres</h3>
      {clientAddresses.length > 0 ? (
        <div className="space-y-2 mb-3">
          {clientAddresses.map((addr) => (
            <button
              key={addr.id}
              onClick={() => {
                setSelectedAddressId(addr.id);
                setShippingStreet(addr.street ?? "");
                setShippingPostalCode(addr.postal_code ?? "");
                setShippingCity(addr.city ?? "");
                setShippingCountry(addr.country ?? "Nederland");
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                selectedAddressId === addr.id ? "bg-primary/10 ring-1 ring-primary/30" : ""
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-card-foreground">{addr.label}</span>
                  {addr.is_primary && (
                    <span className="inline-flex items-center rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                      Standaard
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[addr.street, addr.postal_code, addr.city].filter(Boolean).join(", ") || "Geen adres"}
                </p>
              </div>
              {selectedAddressId === addr.id && <Check size={16} className="text-primary" />}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          Geen adressen gevonden voor deze klant. Vul hieronder een verzendadres in.
        </p>
      )}

      {/* Editable address fields (pre-filled from selection) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Straat + huisnr.</label>
          <Input value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} placeholder="Kerkstraat 1" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Postcode</label>
          <Input value={shippingPostalCode} onChange={(e) => setShippingPostalCode(e.target.value)} placeholder="1234 AB" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Plaats</label>
          <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="Amsterdam" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Land</label>
          <Input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} placeholder="Nederland" />
        </div>
      </div>
    </div>

    {/* Collection price */}
    <div>
      <h3 className="text-sm font-semibold text-card-foreground mb-2">Collectieprijs</h3>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Prijs (€)</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={collectionPriceInput}
          onChange={(e) => setCollectionPriceInput(e.target.value)}
          placeholder="0.00"
        />
        {selectedCollection && selectedCollection.price_cents != null && selectedCollection.price_cents > 0 && (
          <p className="text-xs text-muted-foreground">
            Standaardprijs: €{(selectedCollection.price_cents / 100).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 10: Update step labels and step indicator**

```typescript
const stepLabels = ["Kies klant", "Kies collectie", "Adres & prijs", "Levertijd", "Bevestig"];
```

Update the step indicator to loop `[1, 2, 3, 4, 5]` instead of `[1, 2, 3, 4]`, and the divider condition to `s < 5`.

- [ ] **Step 11: Shift old step 3 (Levertijd) to step 4**

Change `{step === 3 && (` to `{step === 4 && (` for the Levertijd section.

- [ ] **Step 12: Shift old step 4 (Bevestig) to step 5**

Change `{step === 4 && (` to `{step === 5 && (` for the Bevestig section.

Add address and price to the confirmation summary:
```tsx
<div className="flex justify-between">
  <span className="text-muted-foreground">Verzendadres</span>
  <span className="font-medium text-card-foreground text-right max-w-[60%]">
    {[shippingStreet, shippingPostalCode, shippingCity, shippingCountry]
      .filter(Boolean)
      .join(", ") || "Niet ingevuld"}
  </span>
</div>
{parseFloat(collectionPriceInput || "0") > 0 && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Collectieprijs</span>
    <span className="font-medium text-card-foreground">
      €{parseFloat(collectionPriceInput).toFixed(2)}
    </span>
  </div>
)}
```

- [ ] **Step 13: Update navigation buttons**

Update the back button cast:
```tsx
onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5)}
```

Update the Volgende button conditions:
```tsx
{(step === 3 || step === 4) && (
  <Button
    size="sm"
    onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4 | 5)}
    disabled={step === 4 && !deliveryDate}
  >
    Volgende <ArrowRight size={14} />
  </Button>
)}
{step === 5 && (
  <Button size="sm" onClick={handleConfirm} disabled={saving}>
    {saving ? "Aanmaken..." : "Order aanmaken"}
  </Button>
)}
```

- [ ] **Step 14: Update handleConfirm to include new fields**

```typescript
const priceCents = Math.round(parseFloat(collectionPriceInput || "0") * 100);

const { error: insertError } = await supabase.from("orders").insert({
  client_id: selectedClient.id,
  collection_id: selectedCollection.id,
  delivery_date: deliveryDate,
  notes: notes.trim() || null,
  created_by: user?.id ?? null,
  shipping_street: shippingStreet.trim() || null,
  shipping_postal_code: shippingPostalCode.trim() || null,
  shipping_city: shippingCity.trim() || null,
  shipping_country: shippingCountry.trim() || null,
  collection_price_cents: priceCents > 0 ? priceCents : null,
});
```

- [ ] **Step 15: Update resetAll to clear new state**

```typescript
setClientAddresses([]);
setSelectedAddressId(null);
setShippingStreet("");
setShippingPostalCode("");
setShippingCity("");
setShippingCountry("Nederland");
setCollectionPriceInput("");
```

- [ ] **Step 16: Test manually**

1. Open the order creation modal
2. Select a client with multiple addresses → verify addresses appear as selectable list in step 3
3. Click a different address → verify fields update
4. Edit the address fields manually → verify they stay edited
5. Select a collection with a price → verify price is pre-filled in step 3
6. Modify the price
7. Proceed to step 4 (levertijd) → step 5 (bevestig)
8. Verify confirmation shows correct address + price
9. Create the order → verify in Supabase that shipping fields + price are stored
10. Test with a client that has NO addresses → verify empty fields work

- [ ] **Step 17: Commit**

```bash
git add src/components/order-create-modal.tsx
git commit -m "feat: add address selection and collection price to order creation flow"
```

---

## Task 7: UI — Show shipping address + price on order detail page

**Files:**
- Modify: `src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1: Update OrderDetail interface**

Add the new fields:
```typescript
shipping_street: string | null;
shipping_postal_code: string | null;
shipping_city: string | null;
shipping_country: string | null;
collection_price_cents: number | null;
```

- [ ] **Step 2: Include fields in the Supabase select query**

If the query uses `*`, they're already included. Just make sure the TypeScript interface matches.

- [ ] **Step 3: Display shipping address and price in the order detail view**

Add a section to the order detail page:
```tsx
{/* Verzendadres */}
{(order.shipping_street || order.shipping_city) && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Verzendadres</span>
    <span className="font-medium text-card-foreground text-right">
      {[order.shipping_street, order.shipping_postal_code, order.shipping_city, order.shipping_country]
        .filter(Boolean)
        .join(", ")}
    </span>
  </div>
)}

{/* Collectieprijs */}
{order.collection_price_cents != null && order.collection_price_cents > 0 && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Collectieprijs</span>
    <span className="font-medium text-card-foreground">
      €{(order.collection_price_cents / 100).toFixed(2)}
    </span>
  </div>
)}
```

- [ ] **Step 4: Test manually** — Create an order with address + price, open the detail page, verify both are displayed.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/orders/\[id\]/page.tsx
git commit -m "feat: display shipping address and collection price on order detail page"
```

---

## Task 8: Verification & final commit

- [ ] **Step 1: Run build to check for TypeScript errors**

```bash
cd karpi-sample-management && npm run build
```

Fix any type errors.

- [ ] **Step 2: Manual end-to-end test**

1. Add multiple addresses to a client (detail page → Adressen tab)
2. Set a primary address
3. Set a price on a collection (collecties page)
4. Create an order for that client + collection
5. Verify address list shows in step 3, primary is pre-selected
6. Verify collection price is pre-filled
7. Change address selection → fields update
8. Edit price → proceed through remaining steps
9. Verify order detail page shows the shipping address + price
10. Create another order for a client with NO addresses → verify it still works

- [ ] **Step 3: Final commit (if build fixes needed)**

```bash
git add -A
git commit -m "fix: resolve build errors from address and pricing feature"
```
