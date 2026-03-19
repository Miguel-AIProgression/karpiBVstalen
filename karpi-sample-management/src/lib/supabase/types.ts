// Placeholder types — replace with generated types once Supabase project is connected
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts

export type Database = {
  public: {
    Tables: {
      collections: {
        Row: { id: string; name: string; description: string | null; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; description?: string | null; active?: boolean };
        Update: { name?: string; description?: string | null; active?: boolean };
        Relationships: [];
      };
      qualities: {
        Row: { id: string; collection_id: string; name: string; material_type: string | null; base_price: number | null; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; collection_id: string; name: string; material_type?: string | null; base_price?: number | null; active?: boolean };
        Update: { collection_id?: string; name?: string; material_type?: string | null; base_price?: number | null; active?: boolean };
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
      bundle_stock: {
        Row: { bundle_config_id: string; location_id: string; quantity: number; updated_at: string };
        Insert: { bundle_config_id: string; location_id: string; quantity?: number };
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
      bundle_configs: {
        Row: { id: string; name: string; client_id: string | null; is_template: boolean; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; client_id?: string | null; is_template?: boolean; active?: boolean };
        Update: { name?: string; client_id?: string | null; is_template?: boolean; active?: boolean };
        Relationships: [];
      };
      bundle_config_items: {
        Row: { id: string; bundle_config_id: string; quality_id: string; color_code_id: string | null; finishing_type_id: string; dimension_id: string; quantity: number };
        Insert: { id?: string; bundle_config_id: string; quality_id: string; color_code_id?: string | null; finishing_type_id: string; dimension_id: string; quantity: number };
        Update: { bundle_config_id?: string; quality_id?: string; color_code_id?: string | null; finishing_type_id?: string; dimension_id?: string; quantity?: number };
        Relationships: [];
      };
      bundle_batches: {
        Row: { id: string; bundle_config_id: string; location_id: string; quantity: number; assembled_at: string; assembled_by: string; created_at: string };
        Insert: { id?: string; bundle_config_id: string; location_id: string; quantity: number; assembled_by: string };
        Update: { quantity?: number };
        Relationships: [];
      };
      clients: {
        Row: { id: string; parent_client_id: string | null; name: string; client_type: string; contact_email: string | null; logo_url: string | null; sticker_text: string | null; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; parent_client_id?: string | null; name: string; client_type: string; contact_email?: string | null; logo_url?: string | null; sticker_text?: string | null; active?: boolean };
        Update: { parent_client_id?: string | null; name?: string; client_type?: string; contact_email?: string | null; logo_url?: string | null; sticker_text?: string | null; active?: boolean };
        Relationships: [];
      };
      client_purchase_prices: {
        Row: { id: string; client_id: string; quality_id: string; finishing_type_id: string | null; price: number; valid_from: string; valid_until: string | null; created_at: string };
        Insert: { id?: string; client_id: string; quality_id: string; finishing_type_id?: string | null; price: number; valid_from?: string; valid_until?: string | null };
        Update: { client_id?: string; quality_id?: string; finishing_type_id?: string | null; price?: number; valid_from?: string; valid_until?: string | null };
        Relationships: [];
      };
      client_retail_prices: {
        Row: { id: string; client_id: string; quality_id: string; dimension_id: string; price: number; price_per: string; created_at: string };
        Insert: { id?: string; client_id: string; quality_id: string; dimension_id: string; price: number; price_per?: string };
        Update: { client_id?: string; quality_id?: string; dimension_id?: string; price?: number; price_per?: string };
        Relationships: [];
      };
      client_product_rules: {
        Row: { id: string; client_id: string; quality_id: string; finishing_type_id: string | null; rule_type: string };
        Insert: { id?: string; client_id: string; quality_id: string; finishing_type_id?: string | null; rule_type: string };
        Update: { client_id?: string; quality_id?: string; finishing_type_id?: string | null; rule_type?: string };
        Relationships: [];
      };
    };
    Views: {
      v_pipeline_status: {
        Row: { quality_id: string; quality_name: string; collection_id: string; collection_name: string; color_code_id: string; color_code: string; color_name: string; dimension_id: string; dimension_name: string; raw_stock_total: number; finished_stock_total: number; bundle_stock_total: number };
        Relationships: [];
      };
      v_bundle_availability: {
        Row: { bundle_config_id: string; bundle_name: string; client_id: string | null; bundles_ready: number; bundles_makeable: number };
        Relationships: [];
      };
      v_restock_needed: {
        Row: { quality_name: string; color_code: string; color_name: string; finishing_name: string; dimension_name: string; location_label: string; current_stock: number; raw_available: number };
        Relationships: [];
      };
      v_client_catalog: {
        Row: { client_id: string; client_name: string; quality_id: string; quality_name: string; collection_name: string; finishing_type_id: string; finishing_name: string; technically_allowed: boolean; commercially_allowed: boolean };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
