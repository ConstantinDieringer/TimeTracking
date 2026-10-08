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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          absence_date: string
          announced_on: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          half_day: boolean
          id: string
          kind: Database["public"]["Enums"]["absence_kind"]
          note: string | null
          organization_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absence_date: string
          announced_on?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          half_day?: boolean
          id?: string
          kind: Database["public"]["Enums"]["absence_kind"]
          note?: string | null
          organization_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absence_date?: string
          announced_on?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          half_day?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["absence_kind"]
          note?: string | null
          organization_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          employee_id: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          operation: string
          organization_id: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          employee_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          organization_id?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          employee_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          organization_id?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_types: {
        Row: {
          archived: boolean
          category: Database["public"]["Enums"]["contract_category"]
          created_at: string
          description: string | null
          id: string
          label: string
          organization_id: string | null
          sort_order: number
        }
        Insert: {
          archived?: boolean
          category: Database["public"]["Enums"]["contract_category"]
          created_at?: string
          description?: string | null
          id?: string
          label: string
          organization_id?: string | null
          sort_order?: number
        }
        Update: {
          archived?: boolean
          category?: Database["public"]["Enums"]["contract_category"]
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          organization_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_contracts: {
        Row: {
          all_in: boolean
          collective_agreement: string | null
          collective_weekly_hours: number
          contract_type_id: string
          created_at: string
          daily_target_minutes: number[]
          employee_id: string
          exempt_from_azg: boolean
          flex_allows_full_day_compensation: boolean
          flex_enabled: boolean
          flex_frame_end: string
          flex_frame_start: string
          flex_max_carry_credit_minutes: number
          flex_max_carry_debit_minutes: number
          flex_period_anchor: string | null
          flex_period_months: number
          id: string
          monthly_gross_cents: number | null
          night_work: boolean
          note: string | null
          organization_id: string | null
          shift_work: boolean
          updated_at: string
          vacation_days_per_year: number
          valid_from: string
          valid_to: string | null
          weekly_hours: number
        }
        Insert: {
          all_in?: boolean
          collective_agreement?: string | null
          collective_weekly_hours?: number
          contract_type_id: string
          created_at?: string
          daily_target_minutes?: number[]
          employee_id: string
          exempt_from_azg?: boolean
          flex_allows_full_day_compensation?: boolean
          flex_enabled?: boolean
          flex_frame_end?: string
          flex_frame_start?: string
          flex_max_carry_credit_minutes?: number
          flex_max_carry_debit_minutes?: number
          flex_period_anchor?: string | null
          flex_period_months?: number
          id?: string
          monthly_gross_cents?: number | null
          night_work?: boolean
          note?: string | null
          organization_id?: string | null
          shift_work?: boolean
          updated_at?: string
          vacation_days_per_year?: number
          valid_from: string
          valid_to?: string | null
          weekly_hours: number
        }
        Update: {
          all_in?: boolean
          collective_agreement?: string | null
          collective_weekly_hours?: number
          contract_type_id?: string
          created_at?: string
          daily_target_minutes?: number[]
          employee_id?: string
          exempt_from_azg?: boolean
          flex_allows_full_day_compensation?: boolean
          flex_enabled?: boolean
          flex_frame_end?: string
          flex_frame_start?: string
          flex_max_carry_credit_minutes?: number
          flex_max_carry_debit_minutes?: number
          flex_period_anchor?: string | null
          flex_period_months?: number
          id?: string
          monthly_gross_cents?: number | null
          night_work?: boolean
          note?: string | null
          organization_id?: string | null
          shift_work?: boolean
          updated_at?: string
          vacation_days_per_year?: number
          valid_from?: string
          valid_to?: string | null
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          company_register_number: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          vat_id: string | null
        }
        Insert: {
          active?: boolean
          company_register_number?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          vat_id?: string | null
        }
        Update: {
          active?: boolean
          company_register_number?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          vat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          birth_date: string | null
          created_at: string
          display_name: string
          hired_on: string
          id: string
          left_on: string | null
          organization_id: string | null
          personnel_number: string | null
          role: Database["public"]["Enums"]["app_role"]
          state: Database["public"]["Enums"]["austrian_state"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          birth_date?: string | null
          created_at?: string
          display_name: string
          hired_on: string
          id: string
          left_on?: string | null
          organization_id?: string | null
          personnel_number?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          state?: Database["public"]["Enums"]["austrian_state"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          birth_date?: string | null
          created_at?: string
          display_name?: string
          hired_on?: string
          id?: string
          left_on?: string | null
          organization_id?: string | null
          personnel_number?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          state?: Database["public"]["Enums"]["austrian_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          id: number
          key: string
          organization_id: string | null
          updated_at: string
          valid_year: number
          value: Json
        }
        Insert: {
          description?: string | null
          id?: never
          key: string
          organization_id?: string | null
          updated_at?: string
          valid_year: number
          value: Json
        }
        Update: {
          description?: string | null
          id?: never
          key?: string
          organization_id?: string | null
          updated_at?: string
          valid_year?: number
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          ended_at: string | null
          id: string
          kind: Database["public"]["Enums"]["segment_kind"]
          note: string | null
          organization_id: string | null
          source: Database["public"]["Enums"]["entry_source"]
          started_at: string
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          ended_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["segment_kind"]
          note?: string | null
          organization_id?: string | null
          source?: Database["public"]["Enums"]["entry_source"]
          started_at: string
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          ended_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["segment_kind"]
          note?: string | null
          organization_id?: string | null
          source?: Database["public"]["Enums"]["entry_source"]
          started_at?: string
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_to_organization: {
        Args: {
          p_display_name?: string
          p_email: string
          p_organization: string
          p_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      contract_on: {
        Args: { p_date: string; p_employee: string }
        Returns: {
          all_in: boolean
          collective_agreement: string | null
          collective_weekly_hours: number
          contract_type_id: string
          created_at: string
          daily_target_minutes: number[]
          employee_id: string
          exempt_from_azg: boolean
          flex_allows_full_day_compensation: boolean
          flex_enabled: boolean
          flex_frame_end: string
          flex_frame_start: string
          flex_max_carry_credit_minutes: number
          flex_max_carry_debit_minutes: number
          flex_period_anchor: string | null
          flex_period_months: number
          id: string
          monthly_gross_cents: number | null
          night_work: boolean
          note: string | null
          organization_id: string | null
          shift_work: boolean
          updated_at: string
          vacation_days_per_year: number
          valid_from: string
          valid_to: string | null
          weekly_hours: number
        }
        SetofOptions: {
          from: "*"
          to: "employment_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization: {
        Args: {
          p_name: string
          p_owner_display_name?: string
          p_owner_email: string
        }
        Returns: string
      }
      current_employee_id: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      save_contract_defaults: { Args: { p_value: Json }; Returns: undefined }
      transfer_ownership: { Args: { p_new_owner: string }; Returns: undefined }
    }
    Enums: {
      absence_kind:
        | "urlaub"
        | "krankenstand"
        | "pflegefreistellung"
        | "zeitausgleich"
        | "persoenlicher_feiertag"
        | "sonderurlaub"
        | "dienstfreistellung"
        | "unbezahlt"
      app_role: "employee" | "admin"
      austrian_state: "W" | "NO" | "OO" | "S" | "ST" | "K" | "T" | "V" | "B"
      contract_category:
        | "vollzeit"
        | "teilzeit"
        | "geringfuegig"
        | "lehrling"
        | "freier_dienstnehmer"
        | "leitend"
        | "praktikum"
      entry_source: "stamped" | "manual"
      segment_kind: "work" | "break" | "travel" | "oncall"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      absence_kind: [
        "urlaub",
        "krankenstand",
        "pflegefreistellung",
        "zeitausgleich",
        "persoenlicher_feiertag",
        "sonderurlaub",
        "dienstfreistellung",
        "unbezahlt",
      ],
      app_role: ["employee", "admin"],
      austrian_state: ["W", "NO", "OO", "S", "ST", "K", "T", "V", "B"],
      contract_category: [
        "vollzeit",
        "teilzeit",
        "geringfuegig",
        "lehrling",
        "freier_dienstnehmer",
        "leitend",
        "praktikum",
      ],
      entry_source: ["stamped", "manual"],
      segment_kind: ["work", "break", "travel", "oncall"],
    },
  },
} as const
