// Placeholder types — replace with generated types once Supabase project is connected
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts

export type Database = {
  public: {
    Tables: {
      collections: {
        Row: { id: string; name: string; description: string | null; active: boolean; price_cents: number | null; sample_price_cents: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; description?: string | null; active?: boolean; price_cents?: number | null; sample_price_cents?: number | null };
        Update: { name?: string; description?: string | null; active?: boolean; price_cents?: number | null; sample_price_cents?: number | null };
        Relationships: [];
      };
      qualities: {
        Row: { id: string; name: string; code: string; material_type: string | null; base_price: number | null; notes: string | null; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; code: string; material_type?: string | null; base_price?: number | null; notes?: string | null; active?: boolean };
        Update: { name?: string; code?: string; material_type?: string | null; base_price?: number | null; notes?: string | null; active?: boolean };
        Relationships: [];
      };
      color_codes: {
        Row: { id: string; quality_id: string; code: string; name: string; hex_color: string | null; active: boolean; created_at: string };
        Insert: { id?: string; quality_id: string; code: string; name: string; hex_color?: string | null; active?: boolean };
        Update: { quality_id?: string; code?: string; name?: string; hex_color?: string | null; active?: boolean };
        Relationships: [];
      };
      finishing_types: {
        Row: { id: string; name: string; description: string | null; production_time_min: number; active: boolean; created_at: string };
        Insert: { id?: string; name: string; description?: string | null; production_time_min?: number; active?: boolean };
        Update: { name?: string; description?: string | null; production_time_min?: number; active?: boolean };
        Relationships: [];
      };
      quality_finishing_rules: {
        Row: { id: string; quality_id: string; finishing_type_id: string; is_allowed: boolean };
        Insert: { id?: string; quality_id: string; finishing_type_id: string; is_allowed?: boolean };
        Update: { quality_id?: string; finishing_type_id?: string; is_allowed?: boolean };
        Relationships: [];
      };
      sample_dimensions: {
        Row: { id: string; width_cm: number; height_cm: number; name: string; created_at: string };
        Insert: { id?: string; width_cm: number; height_cm: number; name: string };
        Update: { width_cm?: number; height_cm?: number; name?: string };
        Relationships: [];
      };
      samples: {
        Row: { id: string; quality_id: string; color_code_id: string; dimension_id: string; photo_url: string | null; description: string | null; location: string | null; min_stock: number; active: boolean; created_at: string };
        Insert: { id?: string; quality_id: string; color_code_id: string; dimension_id: string; photo_url?: string | null; description?: string | null; location?: string | null; min_stock?: number; active?: boolean };
        Update: { quality_id?: string; color_code_id?: string; dimension_id?: string; photo_url?: string | null; description?: string | null; location?: string | null; min_stock?: number; active?: boolean };
        Relationships: [];
      };
      locations: {
        Row: { id: string; warehouse_id: string | null; aisle: string; rack: string; level: string; label: string; created_at: string };
        Insert: { id?: string; warehouse_id?: string | null; aisle: string; rack: string; level: string };
        Update: { warehouse_id?: string | null; aisle?: string; rack?: string; level?: string };
        Relationships: [];
      };
      raw_stock: {
        Row: { quality_id: string; color_code_id: string; dimension_id: string; location_id: string; quantity: number; updated_at: string };
        Insert: { quality_id: string; color_code_id: string; dimension_id: string; location_id: string; quantity?: number };
        Update: { quantity?: number };
        Relationships: [];
      };
      finished_stock: {
        Row: { quality_id: string; color_code_id: string; dimension_id: string; finishing_type_id: string; location_id: string; quantity: number; updated_at: string };
        Insert: { quality_id: string; color_code_id: string; dimension_id: string; finishing_type_id: string; location_id: string; quantity?: number };
        Update: { quantity?: number };
        Relationships: [];
      };
      extras: {
        Row: { id: string; name: string; type: string; description: string | null; min_stock: number; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; type: string; description?: string | null; min_stock?: number; active?: boolean };
        Update: { name?: string; type?: string; description?: string | null; min_stock?: number; active?: boolean };
        Relationships: [];
      };
      extras_stock: {
        Row: { id: string; extra_id: string; location_id: string; quantity: number };
        Insert: { id?: string; extra_id: string; location_id: string; quantity?: number };
        Update: { extra_id?: string; location_id?: string; quantity?: number };
        Relationships: [];
      };
      bundle_stock: {
        Row: { bundle_id: string; location_id: string; quantity: number; updated_at: string };
        Insert: { bundle_id: string; location_id: string; quantity?: number };
        Update: { quantity?: number };
        Relationships: [];
      };
      cut_batches: {
        Row: { id: string; quality_id: string; color_code_id: string; dimension_id: string; location_id: string; quantity: number; cut_date: string; cut_by: string; created_at: string };
        Insert: { id?: string; quality_id: string; color_code_id: string; dimension_id: string; location_id: string; quantity: number; cut_by: string };
        Update: { quality_id?: string; color_code_id?: string; dimension_id?: string; location_id?: string; quantity?: number; cut_by?: string };
        Relationships: [];
      };
      finishing_batches: {
        Row: { id: string; quality_id: string; color_code_id: string; dimension_id: string; finishing_type_id: string; source_location_id: string; target_location_id: string; quantity: number; started_at: string; finished_at: string | null; finished_by: string; created_at: string };
        Insert: { id?: string; quality_id: string; color_code_id: string; dimension_id: string; finishing_type_id: string; source_location_id: string; target_location_id: string; quantity: number; finished_by: string };
        Update: { quantity?: number; finished_at?: string };
        Relationships: [];
      };
      bundles: {
        Row: { id: string; name: string; quality_id: string | null; dimension_id: string | null; active: boolean; price_cents: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; quality_id?: string | null; dimension_id?: string | null; active?: boolean; price_cents?: number | null };
        Update: { name?: string; quality_id?: string | null; dimension_id?: string | null; active?: boolean; price_cents?: number | null };
        Relationships: [];
      };
      bundle_colors: {
        Row: { id: string; bundle_id: string; color_code_id: string; position: number };
        Insert: { id?: string; bundle_id: string; color_code_id: string; position?: number };
        Update: { bundle_id?: string; color_code_id?: string; position?: number };
        Relationships: [];
      };
      bundle_items: {
        Row: { id: string; bundle_id: string; sample_id: string; position: number; created_at: string };
        Insert: { id?: string; bundle_id: string; sample_id: string; position?: number };
        Update: { bundle_id?: string; sample_id?: string; position?: number };
        Relationships: [];
      };
      bundle_batches: {
        Row: { id: string; bundle_id: string; location_id: string; quantity: number; assembled_at: string; assembled_by: string; created_at: string };
        Insert: { id?: string; bundle_id: string; location_id: string; quantity: number; assembled_by: string };
        Update: { quantity?: number };
        Relationships: [];
      };
      collection_bundles: {
        Row: { id: string; collection_id: string; bundle_id: string; position: number };
        Insert: { id?: string; collection_id: string; bundle_id: string; position?: number };
        Update: { collection_id?: string; bundle_id?: string; position?: number };
        Relationships: [];
      };
      client_addresses: {
        Row: { id: string; client_id: string; label: string; street: string | null; postal_code: string | null; city: string | null; country: string | null; is_primary: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; label?: string; street?: string | null; postal_code?: string | null; city?: string | null; country?: string | null; is_primary?: boolean };
        Update: { client_id?: string; label?: string; street?: string | null; postal_code?: string | null; city?: string | null; country?: string | null; is_primary?: boolean };
        Relationships: [];
      };
      // --- Fase 3: Klanten & Prijzen (tabellen bestaan, nog geen frontend) ---
      clients: {
        Row: { id: string; parent_client_id: string | null; name: string; client_type: string; client_number: string | null; contact_email: string | null; logo_url: string | null; sticker_text: string | null; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; parent_client_id?: string | null; name: string; client_type: string; client_number?: string | null; contact_email?: string | null; logo_url?: string | null; sticker_text?: string | null; active?: boolean };
        Update: { parent_client_id?: string | null; name?: string; client_type?: string; client_number?: string | null; contact_email?: string | null; logo_url?: string | null; sticker_text?: string | null; active?: boolean };
        Relationships: [];
      };
      client_product_rules: {
        Row: { id: string; client_id: string; quality_id: string; finishing_type_id: string | null; rule_type: string };
        Insert: { id?: string; client_id: string; quality_id: string; finishing_type_id?: string | null; rule_type: string };
        Update: { client_id?: string; quality_id?: string; finishing_type_id?: string | null; rule_type?: string };
        Relationships: [];
      };
      client_purchase_prices: {
        Row: { id: string; client_id: string; quality_id: string; finishing_type_id: string | null; price: number; valid_from: string; valid_until: string | null; created_at: string };
        Insert: { id?: string; client_id: string; quality_id: string; finishing_type_id?: string | null; price: number; valid_from: string; valid_until?: string | null };
        Update: { client_id?: string; quality_id?: string; finishing_type_id?: string | null; price?: number; valid_from?: string; valid_until?: string | null };
        Relationships: [];
      };
      client_quality_names: {
        Row: { id: string; client_id: string; quality_id: string; custom_name: string; created_at: string };
        Insert: { id?: string; client_id: string; quality_id: string; custom_name: string };
        Update: { client_id?: string; quality_id?: string; custom_name?: string };
        Relationships: [];
      };
      carpet_dimensions: {
        Row: { id: string; width_cm: number; height_cm: number; name: string; active: boolean; created_at: string };
        Insert: { id?: string; width_cm: number; height_cm: number; name: string; active?: boolean };
        Update: { width_cm?: number; height_cm?: number; name?: string; active?: boolean };
        Relationships: [];
      };
      quality_carpet_dimensions: {
        Row: { id: string; quality_id: string; carpet_dimension_id: string; active: boolean };
        Insert: { id?: string; quality_id: string; carpet_dimension_id: string; active?: boolean };
        Update: { quality_id?: string; carpet_dimension_id?: string; active?: boolean };
        Relationships: [];
      };
      client_carpet_prices: {
        Row: { id: string; client_id: string; quality_id: string; carpet_dimension_id: string | null; price_cents: number; unit: string; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; quality_id: string; carpet_dimension_id?: string | null; price_cents: number; unit?: string };
        Update: { client_id?: string; quality_id?: string; carpet_dimension_id?: string | null; price_cents?: number; unit?: string };
        Relationships: [];
      };
      quality_base_prices: {
        Row: { id: string; quality_id: string; carpet_dimension_id: string | null; price_cents: number; unit: string; created_at: string; updated_at: string };
        Insert: { id?: string; quality_id: string; carpet_dimension_id?: string | null; price_cents: number; unit?: string };
        Update: { quality_id?: string; carpet_dimension_id?: string | null; price_cents?: number; unit?: string };
        Relationships: [];
      };
      // --- Fase 4: Ordermanagement ---
      orders: {
        Row: { id: string; order_number: string; client_id: string; collection_id: string; delivery_date: string; status: string; notes: string | null; created_by: string | null; shipping_street: string | null; shipping_postal_code: string | null; shipping_city: string | null; shipping_country: string | null; collection_price_cents: number | null; price_factor: number | null; excluded_dimensions: string[] | null; created_at: string; updated_at: string };
        Insert: { id?: string; order_number?: string; client_id: string; collection_id: string; delivery_date: string; status?: string; notes?: string | null; created_by?: string | null; shipping_street?: string | null; shipping_postal_code?: string | null; shipping_city?: string | null; shipping_country?: string | null; collection_price_cents?: number | null; price_factor?: number | null; excluded_dimensions?: string[] | null };
        Update: { client_id?: string; collection_id?: string; delivery_date?: string; status?: string; notes?: string | null; shipping_street?: string | null; shipping_postal_code?: string | null; shipping_city?: string | null; shipping_country?: string | null; collection_price_cents?: number | null; price_factor?: number | null; excluded_dimensions?: string[] | null };
        Relationships: [];
      };
      order_lines: {
        Row: { id: string; order_id: string; bundle_id: string; quantity: number; created_at: string };
        Insert: { id?: string; order_id: string; bundle_id: string; quantity?: number };
        Update: { order_id?: string; bundle_id?: string; quantity?: number };
        Relationships: [];
      };
      accessories: {
        Row: { id: string; name: string; type: string; default_price_cents: number; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; type: string; default_price_cents: number; active?: boolean };
        Update: { name?: string; type?: string; default_price_cents?: number; active?: boolean };
        Relationships: [];
      };
      order_accessories: {
        Row: { id: string; order_id: string; accessory_id: string; quantity: number; price_cents: number; created_at: string };
        Insert: { id?: string; order_id: string; accessory_id: string; quantity?: number; price_cents: number };
        Update: { order_id?: string; accessory_id?: string; quantity?: number; price_cents?: number };
        Relationships: [];
      };
    };
    Views: {
      v_pipeline_status: {
        Row: { bundle_id: string; bundle_name: string; quality_id: string; quality_name: string; quality_code: string; color_code_id: string; color_code: string; color_name: string; dimension_id: string; dimension_name: string; finished_stock_total: number; bundle_stock_total: number; sample_location: string | null; collection_names: string | null };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
