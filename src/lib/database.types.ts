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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      exercises: {
        Row: {
          created_at: string
          cycle_failures: number
          id: string
          linear_consecutive_failures: number
          linear_current_load: number | null
          linear_increment_steps: number | null
          linear_target_reps: number | null
          linear_target_sets: number | null
          name: string
          pending_deload: boolean
          plate_rounding: number | null
          rest_seconds: number
          scheme: string
          updated_at: string
          user_id: string
          wave_base_load: number | null
          wave_current_cycle: number | null
          wave_current_week: number | null
        }
        Insert: {
          created_at?: string
          cycle_failures?: number
          id?: string
          linear_consecutive_failures?: number
          linear_current_load?: number | null
          linear_increment_steps?: number | null
          linear_target_reps?: number | null
          linear_target_sets?: number | null
          name: string
          pending_deload?: boolean
          plate_rounding?: number | null
          rest_seconds?: number
          scheme: string
          updated_at?: string
          user_id: string
          wave_base_load?: number | null
          wave_current_cycle?: number | null
          wave_current_week?: number | null
        }
        Update: {
          created_at?: string
          cycle_failures?: number
          id?: string
          linear_consecutive_failures?: number
          linear_current_load?: number | null
          linear_increment_steps?: number | null
          linear_target_reps?: number | null
          linear_target_sets?: number | null
          name?: string
          pending_deload?: boolean
          plate_rounding?: number | null
          rest_seconds?: number
          scheme?: string
          updated_at?: string
          user_id?: string
          wave_base_load?: number | null
          wave_current_cycle?: number | null
          wave_current_week?: number | null
        }
        Relationships: []
      }
      scheda_days: {
        Row: {
          exercise_ids: string[]
          id: string
          name: string
          position: number
          scheda_id: string
          user_id: string
        }
        Insert: {
          exercise_ids?: string[]
          id?: string
          name: string
          position?: number
          scheda_id: string
          user_id: string
        }
        Update: {
          exercise_ids?: string[]
          id?: string
          name?: string
          position?: number
          scheda_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheda_days_scheda_id_fkey"
            columns: ["scheda_id"]
            isOneToOne: false
            referencedRelation: "schede"
            referencedColumns: ["id"]
          },
        ]
      }
      schede: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_entries: {
        Row: {
          actual_sets: Json
          exercise_id: string
          id: string
          is_deload_session: boolean
          position: number
          prescribed: Json
          result_info: Json | null
          skipped: boolean
          user_action: string | null
          user_id: string
          workout_id: string
        }
        Insert: {
          actual_sets: Json
          exercise_id: string
          id?: string
          is_deload_session?: boolean
          position: number
          prescribed: Json
          result_info?: Json | null
          skipped?: boolean
          user_action?: string | null
          user_id: string
          workout_id: string
        }
        Update: {
          actual_sets?: Json
          exercise_id?: string
          id?: string
          is_deload_session?: boolean
          position?: number
          prescribed?: Json
          result_info?: Json | null
          skipped?: boolean
          user_action?: string | null
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_entries_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_entries_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          day_id: string | null
          duration_sec: number | null
          id: string
          note: string | null
          performed_at: string
          scheda_id: string | null
          skipped: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          day_id?: string | null
          duration_sec?: number | null
          id?: string
          note?: string | null
          performed_at: string
          scheda_id?: string | null
          skipped?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          day_id?: string | null
          duration_sec?: number | null
          id?: string
          note?: string | null
          performed_at?: string
          scheda_id?: string | null
          skipped?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "scheda_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_scheda_id_fkey"
            columns: ["scheda_id"]
            isOneToOne: false
            referencedRelation: "schede"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
