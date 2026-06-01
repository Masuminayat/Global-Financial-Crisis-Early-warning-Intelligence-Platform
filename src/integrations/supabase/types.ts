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
      alerts: {
        Row: {
          country_iso: string
          id: string
          indicator_code: string | null
          message: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          triggered_at: string
        }
        Insert: {
          country_iso: string
          id?: string
          indicator_code?: string | null
          message: string
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          triggered_at?: string
        }
        Update: {
          country_iso?: string
          id?: string
          indicator_code?: string | null
          message?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          currency_code: string | null
          flag_emoji: string | null
          gdp_usd_bn: number | null
          is_featured: boolean
          iso_code: string
          name: string
          population: number | null
          region: string
          slug: string
          sub_region: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string | null
          flag_emoji?: string | null
          gdp_usd_bn?: number | null
          is_featured?: boolean
          iso_code: string
          name: string
          population?: number | null
          region: string
          slug: string
          sub_region?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string | null
          flag_emoji?: string | null
          gdp_usd_bn?: number | null
          is_featured?: boolean
          iso_code?: string
          name?: string
          population?: number | null
          region?: string
          slug?: string
          sub_region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crisis_events: {
        Row: {
          country_iso: string | null
          created_at: string
          crisis_type: Database["public"]["Enums"]["crisis_type"]
          description: string
          end_date: string | null
          id: string
          name: string
          outcome: string | null
          region: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          start_date: string
          warning_signals: Json
        }
        Insert: {
          country_iso?: string | null
          created_at?: string
          crisis_type: Database["public"]["Enums"]["crisis_type"]
          description: string
          end_date?: string | null
          id?: string
          name: string
          outcome?: string | null
          region?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          start_date: string
          warning_signals?: Json
        }
        Update: {
          country_iso?: string | null
          created_at?: string
          crisis_type?: Database["public"]["Enums"]["crisis_type"]
          description?: string
          end_date?: string | null
          id?: string
          name?: string
          outcome?: string | null
          region?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          start_date?: string
          warning_signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "crisis_events_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      economic_indicators: {
        Row: {
          country_iso: string
          created_at: string
          id: string
          indicator_code: string
          indicator_name: string
          period_date: string
          source: string | null
          unit: string | null
          value: number
        }
        Insert: {
          country_iso: string
          created_at?: string
          id?: string
          indicator_code: string
          indicator_name: string
          period_date: string
          source?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          country_iso?: string
          created_at?: string
          id?: string
          indicator_code?: string
          indicator_name?: string
          period_date?: string
          source?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "economic_indicators_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      forecasts: {
        Row: {
          ci_lower: number
          ci_upper: number
          country_iso: string
          forecast_date: string
          generated_at: string
          horizon_months: number
          id: string
          indicator_code: string
          mape: number | null
          model: string
          point_value: number
        }
        Insert: {
          ci_lower: number
          ci_upper: number
          country_iso: string
          forecast_date: string
          generated_at?: string
          horizon_months: number
          id?: string
          indicator_code: string
          mape?: number | null
          model?: string
          point_value: number
        }
        Update: {
          ci_lower?: number
          ci_upper?: number
          country_iso?: string
          forecast_date?: string
          generated_at?: string
          horizon_months?: number
          id?: string
          indicator_code?: string
          mape?: number | null
          model?: string
          point_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      gfss_scores: {
        Row: {
          category: Database["public"]["Enums"]["gfss_category"]
          country_iso: string
          score: number
          trend_30d: number
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["gfss_category"]
          country_iso: string
          score: number
          trend_30d?: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["gfss_category"]
          country_iso?: string
          score?: number
          trend_30d?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gfss_scores_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: true
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      model_versions: {
        Row: {
          algorithm: string
          crisis_type: Database["public"]["Enums"]["crisis_type"]
          features: Json
          id: string
          is_active: boolean
          roc_auc: number | null
          trained_at: string
          version: string
        }
        Insert: {
          algorithm: string
          crisis_type: Database["public"]["Enums"]["crisis_type"]
          features?: Json
          id?: string
          is_active?: boolean
          roc_auc?: number | null
          trained_at?: string
          version: string
        }
        Update: {
          algorithm?: string
          crisis_type?: Database["public"]["Enums"]["crisis_type"]
          features?: Json
          id?: string
          is_active?: boolean
          roc_auc?: number | null
          trained_at?: string
          version?: string
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          country_iso: string | null
          created_at: string
          id: string
          published_at: string
          sentiment: number | null
          source: string | null
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          country_iso?: string | null
          created_at?: string
          id?: string
          published_at: string
          sentiment?: number | null
          source?: string | null
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          country_iso?: string | null
          created_at?: string
          id?: string
          published_at?: string
          sentiment?: number | null
          source?: string | null
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      risk_scores: {
        Row: {
          ci_lower: number | null
          ci_upper: number | null
          country_iso: string
          crisis_type: Database["public"]["Enums"]["crisis_type"]
          generated_at: string
          horizon_months: number
          id: string
          model_version: string
          probability: number
          risk_level: Database["public"]["Enums"]["risk_level"]
          top_drivers: Json
        }
        Insert: {
          ci_lower?: number | null
          ci_upper?: number | null
          country_iso: string
          crisis_type: Database["public"]["Enums"]["crisis_type"]
          generated_at?: string
          horizon_months: number
          id?: string
          model_version?: string
          probability: number
          risk_level: Database["public"]["Enums"]["risk_level"]
          top_drivers?: Json
        }
        Update: {
          ci_lower?: number | null
          ci_upper?: number | null
          country_iso?: string
          crisis_type?: Database["public"]["Enums"]["crisis_type"]
          generated_at?: string
          horizon_months?: number
          id?: string
          model_version?: string
          probability?: number
          risk_level?: Database["public"]["Enums"]["risk_level"]
          top_drivers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
          },
        ]
      }
      sentiment_index: {
        Row: {
          article_count: number
          country_iso: string
          id: string
          period_date: string
          score: number
        }
        Insert: {
          article_count?: number
          country_iso: string
          id?: string
          period_date: string
          score: number
        }
        Update: {
          article_count?: number
          country_iso?: string
          id?: string
          period_date?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_index_country_iso_fkey"
            columns: ["country_iso"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_code"]
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
      alert_severity: "info" | "warning" | "critical"
      crisis_type:
        | "currency_crisis"
        | "sovereign_debt"
        | "banking_crisis"
        | "imf_bailout"
        | "capital_flight"
        | "bop_crisis"
      gfss_category: "critical" | "weak" | "vulnerable" | "stable" | "strong"
      risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"
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
    Enums: {
      alert_severity: ["info", "warning", "critical"],
      crisis_type: [
        "currency_crisis",
        "sovereign_debt",
        "banking_crisis",
        "imf_bailout",
        "capital_flight",
        "bop_crisis",
      ],
      gfss_category: ["critical", "weak", "vulnerable", "stable", "strong"],
      risk_level: ["LOW", "MODERATE", "HIGH", "CRITICAL"],
    },
  },
} as const
