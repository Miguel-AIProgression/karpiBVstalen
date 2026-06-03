export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          active: boolean
          created_at: string | null
          default_price_cents: number
          id: string
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          default_price_cents: number
          id?: string
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          default_price_cents?: number
          id?: string
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      bundle_batches: {
        Row: {
          assembled_at: string
          assembled_by: string
          bundle_id: string
          created_at: string
          id: string
          location_id: string
          quantity: number
        }
        Insert: {
          assembled_at?: string
          assembled_by: string
          bundle_id: string
          created_at?: string
          id?: string
          location_id: string
          quantity: number
        }
        Update: {
          assembled_at?: string
          assembled_by?: string
          bundle_id?: string
          created_at?: string
          id?: string
          location_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_batches_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_batches_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["bundle_id"]
          },
          {
            foreignKeyName: "bundle_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_colors: {
        Row: {
          bundle_id: string
          color_code_id: string
          id: string
          position: number
        }
        Insert: {
          bundle_id: string
          color_code_id: string
          id?: string
          position?: number
        }
        Update: {
          bundle_id?: string
          color_code_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_colors_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_colors_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["bundle_id"]
          },
          {
            foreignKeyName: "bundle_colors_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_colors_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: string
          created_at: string | null
          id: string
          position: number
          sample_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string | null
          id?: string
          position?: number
          sample_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string | null
          id?: string
          position?: number
          sample_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["bundle_id"]
          },
          {
            foreignKeyName: "bundle_items_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_stock: {
        Row: {
          bundle_id: string
          location_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          bundle_id: string
          location_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          bundle_id?: string
          location_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_stock_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_stock_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["bundle_id"]
          },
          {
            foreignKeyName: "bundle_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          active: boolean
          created_at: string
          dimension_id: string | null
          id: string
          name: string
          price_cents: number | null
          quality_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dimension_id?: string | null
          id?: string
          name: string
          price_cents?: number | null
          quality_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dimension_id?: string | null
          id?: string
          name?: string
          price_cents?: number | null
          quality_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundles_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "sample_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "bundles_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      carpet_dimensions: {
        Row: {
          active: boolean
          created_at: string
          height_cm: number
          id: string
          name: string
          width_cm: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          height_cm: number
          id?: string
          name: string
          width_cm: number
        }
        Update: {
          active?: boolean
          created_at?: string
          height_cm?: number
          id?: string
          name?: string
          width_cm?: number
        }
        Relationships: []
      }
      client_addresses: {
        Row: {
          city: string | null
          client_id: string
          country: string | null
          created_at: string | null
          id: string
          is_primary: boolean
          label: string
          postal_code: string | null
          street: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          client_id: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean
          label?: string
          postal_code?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          client_id?: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean
          label?: string
          postal_code?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_carpet_prices: {
        Row: {
          carpet_dimension_id: string | null
          client_id: string
          created_at: string
          id: string
          price_cents: number
          quality_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          carpet_dimension_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          price_cents: number
          quality_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          carpet_dimension_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          price_cents?: number
          quality_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_carpet_prices_carpet_dimension_id_fkey"
            columns: ["carpet_dimension_id"]
            isOneToOne: false
            referencedRelation: "carpet_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_carpet_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_carpet_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_carpet_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      client_product_rules: {
        Row: {
          client_id: string
          finishing_type_id: string | null
          id: string
          quality_id: string
          rule_type: string
        }
        Insert: {
          client_id: string
          finishing_type_id?: string | null
          id?: string
          quality_id: string
          rule_type: string
        }
        Update: {
          client_id?: string
          finishing_type_id?: string | null
          id?: string
          quality_id?: string
          rule_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_product_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_product_rules_finishing_type_id_fkey"
            columns: ["finishing_type_id"]
            isOneToOne: false
            referencedRelation: "finishing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_product_rules_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_product_rules_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      client_purchase_prices: {
        Row: {
          client_id: string
          created_at: string
          finishing_type_id: string | null
          id: string
          price: number
          quality_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          finishing_type_id?: string | null
          id?: string
          price: number
          quality_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          finishing_type_id?: string | null
          id?: string
          price?: number
          quality_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_purchase_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_purchase_prices_finishing_type_id_fkey"
            columns: ["finishing_type_id"]
            isOneToOne: false
            referencedRelation: "finishing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_purchase_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_purchase_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      client_quality_names: {
        Row: {
          client_id: string
          created_at: string | null
          custom_name: string
          id: string
          quality_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          custom_name: string
          id?: string
          quality_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          custom_name?: string
          id?: string
          quality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_quality_names_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_quality_names_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_quality_names_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          client_number: string | null
          client_type: string
          contact_email: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          parent_client_id: string | null
          price_factor: number | null
          price_list_nr: string | null
          sticker_text: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_number?: string | null
          client_type: string
          contact_email?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          parent_client_id?: string | null
          price_factor?: number | null
          price_list_nr?: string | null
          sticker_text?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_number?: string | null
          client_type?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          parent_client_id?: string | null
          price_factor?: number | null
          price_list_nr?: string | null
          sticker_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_price_list_nr_fkey"
            columns: ["price_list_nr"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["nr"]
          },
        ]
      }
      collection_bundles: {
        Row: {
          bundle_id: string
          collection_id: string
          id: string
          position: number
        }
        Insert: {
          bundle_id: string
          collection_id: string
          id?: string
          position?: number
        }
        Update: {
          bundle_id?: string
          collection_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["bundle_id"]
          },
          {
            foreignKeyName: "collection_bundles_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          price_cents: number | null
          print_stickers: boolean
          sample_price_cents: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_cents?: number | null
          print_stickers?: boolean
          sample_price_cents?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number | null
          print_stickers?: boolean
          sample_price_cents?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      color_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          hex_color: string | null
          id: string
          name: string
          quality_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          hex_color?: string | null
          id?: string
          name: string
          quality_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          hex_color?: string | null
          id?: string
          name?: string
          quality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "color_codes_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "color_codes_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      cut_batches: {
        Row: {
          color_code_id: string
          created_at: string
          cut_by: string
          cut_date: string
          dimension_id: string
          id: string
          location_id: string
          quality_id: string
          quantity: number
        }
        Insert: {
          color_code_id: string
          created_at?: string
          cut_by: string
          cut_date?: string
          dimension_id: string
          id?: string
          location_id: string
          quality_id: string
          quantity: number
        }
        Update: {
          color_code_id?: string
          created_at?: string
          cut_by?: string
          cut_date?: string
          dimension_id?: string
          id?: string
          location_id?: string
          quality_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cut_batches_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_batches_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
          {
            foreignKeyName: "cut_batches_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "sample_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_batches_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "cut_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_batches_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_batches_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      extras: {
        Row: {
          active: boolean
          created_at: string | null
          description: string | null
          id: string
          min_stock: number
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          min_stock?: number
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          min_stock?: number
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      extras_stock: {
        Row: {
          extra_id: string
          id: string
          location_id: string
          quantity: number
        }
        Insert: {
          extra_id: string
          id?: string
          location_id: string
          quantity?: number
        }
        Update: {
          extra_id?: string
          id?: string
          location_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "extras_stock_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extras_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      finished_stock: {
        Row: {
          color_code_id: string
          dimension_id: string
          finishing_type_id: string
          location_id: string
          quality_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          color_code_id: string
          dimension_id: string
          finishing_type_id: string
          location_id: string
          quality_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          color_code_id?: string
          dimension_id?: string
          finishing_type_id?: string
          location_id?: string
          quality_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finished_stock_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_stock_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
          {
            foreignKeyName: "finished_stock_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "sample_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_stock_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "finished_stock_finishing_type_id_fkey"
            columns: ["finishing_type_id"]
            isOneToOne: false
            referencedRelation: "finishing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_stock_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_stock_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      finishing_batches: {
        Row: {
          color_code_id: string
          created_at: string
          dimension_id: string
          finished_at: string | null
          finished_by: string
          finishing_type_id: string
          id: string
          quality_id: string
          quantity: number
          source_location_id: string
          started_at: string
          target_location_id: string
        }
        Insert: {
          color_code_id: string
          created_at?: string
          dimension_id: string
          finished_at?: string | null
          finished_by: string
          finishing_type_id: string
          id?: string
          quality_id: string
          quantity: number
          source_location_id: string
          started_at?: string
          target_location_id: string
        }
        Update: {
          color_code_id?: string
          created_at?: string
          dimension_id?: string
          finished_at?: string | null
          finished_by?: string
          finishing_type_id?: string
          id?: string
          quality_id?: string
          quantity?: number
          source_location_id?: string
          started_at?: string
          target_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finishing_batches_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_batches_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
          {
            foreignKeyName: "finishing_batches_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "sample_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_batches_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "finishing_batches_finishing_type_id_fkey"
            columns: ["finishing_type_id"]
            isOneToOne: false
            referencedRelation: "finishing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_batches_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_batches_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
          {
            foreignKeyName: "finishing_batches_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finishing_batches_target_location_id_fkey"
            columns: ["target_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      finishing_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          production_time_min: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          production_time_min?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          production_time_min?: number
        }
        Relationships: []
      }
      locations: {
        Row: {
          aisle: string
          created_at: string
          id: string
          label: string | null
          level: string
          rack: string
          warehouse_id: string | null
        }
        Insert: {
          aisle: string
          created_at?: string
          id?: string
          label?: string | null
          level: string
          rack: string
          warehouse_id?: string | null
        }
        Update: {
          aisle?: string
          created_at?: string
          id?: string
          label?: string | null
          level?: string
          rack?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      order_accessories: {
        Row: {
          accessory_id: string
          created_at: string | null
          id: string
          order_id: string
          price_cents: number
          quantity: number
        }
        Insert: {
          accessory_id: string
          created_at?: string | null
          id?: string
          order_id: string
          price_cents: number
          quantity?: number
        }
        Update: {
          accessory_id?: string
          created_at?: string | null
          id?: string
          order_id?: string
          price_cents?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_accessories_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_accessories_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          bundle_id: string | null
          created_at: string
          id: string
          order_id: string
          quantity: number
          sample_id: string | null
        }
        Insert: {
          bundle_id?: string | null
          created_at?: string
          id?: string
          order_id: string
          quantity?: number
          sample_id?: string | null
        }
        Update: {
          bundle_id?: string | null
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          sample_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["bundle_id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: { id: string; display_name: string; created_at: string }
        Insert: { id: string; display_name: string; created_at?: string }
        Update: { id?: string; display_name?: string; created_at?: string }
        Relationships: []
      }
      orders: {
        Row: {
          client_id: string
          collection_id: string | null
          collection_price_cents: number | null
          created_at: string
          created_by: string | null
          delivery_date: string
          email: string | null
          excluded_dimensions: Json | null
          id: string
          notes: string | null
          order_number: string
          pakbon_printed: boolean
          price_factor: number | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_postal_code: string | null
          shipping_street: string | null
          show_prices_on_sticker: boolean | null
          status: string
          sticker_name_type: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          collection_id?: string | null
          collection_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          delivery_date: string
          email?: string | null
          excluded_dimensions?: Json | null
          id?: string
          notes?: string | null
          order_number?: string
          pakbon_printed?: boolean
          price_factor?: number | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          shipping_street?: string | null
          show_prices_on_sticker?: boolean | null
          status?: string
          sticker_name_type?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          collection_id?: string | null
          collection_price_cents?: number | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string
          email?: string | null
          excluded_dimensions?: Json | null
          id?: string
          notes?: string | null
          order_number?: string
          pakbon_printed?: boolean
          price_factor?: number | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          shipping_street?: string | null
          show_prices_on_sticker?: boolean | null
          status?: string
          sticker_name_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_colors: {
        Row: {
          color_code_id: string
          created_at: string
          id: string
          price_list_nr: string
          quality_id: string
        }
        Insert: {
          color_code_id: string
          created_at?: string
          id?: string
          price_list_nr: string
          quality_id: string
        }
        Update: {
          color_code_id?: string
          created_at?: string
          id?: string
          price_list_nr?: string
          quality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_colors_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_colors_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
          {
            foreignKeyName: "price_list_colors_price_list_nr_fkey"
            columns: ["price_list_nr"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["nr"]
          },
          {
            foreignKeyName: "price_list_colors_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_colors_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      price_list_color_lines: {
        Row: {
          carpet_dimension_id: string | null
          color_code_id: string
          created_at: string
          id: string
          price_cents: number
          price_list_nr: string
          quality_id: string
          unit: string
        }
        Insert: {
          carpet_dimension_id?: string | null
          color_code_id: string
          created_at?: string
          id?: string
          price_cents: number
          price_list_nr: string
          quality_id: string
          unit?: string
        }
        Update: {
          carpet_dimension_id?: string | null
          color_code_id?: string
          created_at?: string
          id?: string
          price_cents?: number
          price_list_nr?: string
          quality_id?: string
          unit?: string
        }
        Relationships: []
      }
      price_list_lines: {
        Row: {
          carpet_dimension_id: string | null
          created_at: string
          id: string
          price_cents: number
          price_list_nr: string
          quality_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          carpet_dimension_id?: string | null
          created_at?: string
          id?: string
          price_cents?: number
          price_list_nr: string
          quality_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          carpet_dimension_id?: string | null
          created_at?: string
          id?: string
          price_cents?: number
          price_list_nr?: string
          quality_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_lines_carpet_dimension_id_fkey"
            columns: ["carpet_dimension_id"]
            isOneToOne: false
            referencedRelation: "carpet_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_lines_price_list_nr_fkey"
            columns: ["price_list_nr"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["nr"]
          },
          {
            foreignKeyName: "price_list_lines_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_lines_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      price_list_sample_prices: {
        Row: {
          created_at: string
          id: string
          price_cents: number
          price_list_nr: string
          quality_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          price_cents?: number
          price_list_nr: string
          quality_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          price_cents?: number
          price_list_nr?: string
          quality_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_sample_prices_price_list_nr_fkey"
            columns: ["price_list_nr"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["nr"]
          },
          {
            foreignKeyName: "price_list_sample_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_sample_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      price_lists: {
        Row: {
          active: boolean
          created_at: string
          name: string
          nr: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          name: string
          nr: string
          updated_at?: string
          valid_from?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          name?: string
          nr?: string
          updated_at?: string
          valid_from?: string
        }
        Relationships: []
      }
      qualities: {
        Row: {
          active: boolean
          base_price: number | null
          code: string
          created_at: string
          id: string
          material_type: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price?: number | null
          code: string
          created_at?: string
          id?: string
          material_type?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number | null
          code?: string
          created_at?: string
          id?: string
          material_type?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quality_base_prices: {
        Row: {
          carpet_dimension_id: string | null
          created_at: string | null
          id: string
          price_cents: number
          quality_id: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          carpet_dimension_id?: string | null
          created_at?: string | null
          id?: string
          price_cents?: number
          quality_id: string
          unit?: string
          updated_at?: string | null
        }
        Update: {
          carpet_dimension_id?: string | null
          created_at?: string | null
          id?: string
          price_cents?: number
          quality_id?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_base_prices_carpet_dimension_id_fkey"
            columns: ["carpet_dimension_id"]
            isOneToOne: false
            referencedRelation: "carpet_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_base_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_base_prices_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      quality_carpet_dimensions: {
        Row: {
          active: boolean
          carpet_dimension_id: string
          id: string
          quality_id: string
        }
        Insert: {
          active?: boolean
          carpet_dimension_id: string
          id?: string
          quality_id: string
        }
        Update: {
          active?: boolean
          carpet_dimension_id?: string
          id?: string
          quality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_carpet_dimensions_carpet_dimension_id_fkey"
            columns: ["carpet_dimension_id"]
            isOneToOne: false
            referencedRelation: "carpet_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_carpet_dimensions_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_carpet_dimensions_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      quality_finishing_rules: {
        Row: {
          finishing_type_id: string
          id: string
          is_allowed: boolean
          quality_id: string
        }
        Insert: {
          finishing_type_id: string
          id?: string
          is_allowed?: boolean
          quality_id: string
        }
        Update: {
          finishing_type_id?: string
          id?: string
          is_allowed?: boolean
          quality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_finishing_rules_finishing_type_id_fkey"
            columns: ["finishing_type_id"]
            isOneToOne: false
            referencedRelation: "finishing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_finishing_rules_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_finishing_rules_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      raw_stock: {
        Row: {
          color_code_id: string
          dimension_id: string
          location_id: string
          quality_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          color_code_id: string
          dimension_id: string
          location_id: string
          quality_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          color_code_id?: string
          dimension_id?: string
          location_id?: string
          quality_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_stock_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_stock_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
          {
            foreignKeyName: "raw_stock_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "sample_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_stock_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "raw_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_stock_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_stock_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
      sample_brands: {
        Row: {
          brand_id: string
          sample_id: string
        }
        Insert: {
          brand_id: string
          sample_id: string
        }
        Update: {
          brand_id?: string
          sample_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_brands_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_dimensions: {
        Row: {
          created_at: string
          height_cm: number
          id: string
          name: string
          width_cm: number
        }
        Insert: {
          created_at?: string
          height_cm: number
          id?: string
          name: string
          width_cm: number
        }
        Update: {
          created_at?: string
          height_cm?: number
          id?: string
          name?: string
          width_cm?: number
        }
        Relationships: []
      }
      samples: {
        Row: {
          active: boolean
          article_number: string
          color_code_id: string
          created_at: string
          description: string | null
          dimension_id: string
          finishing_type_id: string | null
          id: string
          location: string | null
          min_stock: number
          photo_url: string | null
          quality_id: string
        }
        Insert: {
          active?: boolean
          article_number: string
          color_code_id: string
          created_at?: string
          description?: string | null
          dimension_id: string
          finishing_type_id?: string | null
          id?: string
          location?: string | null
          min_stock?: number
          photo_url?: string | null
          quality_id: string
        }
        Update: {
          active?: boolean
          article_number?: string
          color_code_id?: string
          created_at?: string
          description?: string | null
          dimension_id?: string
          finishing_type_id?: string | null
          id?: string
          location?: string | null
          min_stock?: number
          photo_url?: string | null
          quality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "color_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_color_code_id_fkey"
            columns: ["color_code_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["color_code_id"]
          },
          {
            foreignKeyName: "samples_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "sample_dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "samples_finishing_type_id_fkey"
            columns: ["finishing_type_id"]
            isOneToOne: false
            referencedRelation: "finishing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_status"
            referencedColumns: ["quality_id"]
          },
        ]
      }
    }
    Views: {
      v_pipeline_status: {
        Row: {
          bundle_id: string | null
          bundle_name: string | null
          bundle_stock_total: number | null
          collection_names: string | null
          color_code: string | null
          color_code_id: string | null
          color_name: string | null
          dimension_id: string | null
          dimension_name: string | null
          finished_stock_total: number | null
          quality_code: string | null
          quality_id: string | null
          quality_name: string | null
          sample_location: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_order_number: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
