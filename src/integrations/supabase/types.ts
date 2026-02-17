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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categorias_observacao: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          categoria_pai_id: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          status: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          categoria_pai_id?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          status?: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          categoria_pai_id?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_observacao_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias_observacao"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          obra_id: string
          status: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          obra_id: string
          status?: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          obra_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      especialidades: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          status: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          status?: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          status?: string
        }
        Relationships: []
      }
      obras: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          status: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          status?: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          status?: string
        }
        Relationships: []
      }
      observacoes: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          categoria_id: string
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string
          empresa: string
          especialidade_id: string
          horario: string
          id: string
          notas: string | null
          obra_id: string
          quantidade: number
          rota_id: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          categoria_id: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data: string
          descricao: string
          empresa?: string
          especialidade_id: string
          horario: string
          id?: string
          notas?: string | null
          obra_id: string
          quantidade?: number
          rota_id: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          categoria_id?: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          empresa?: string
          especialidade_id?: string
          horario?: string
          id?: string
          notas?: string | null
          obra_id?: string
          quantidade?: number
          rota_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_observacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          status: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          status?: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          status?: string
        }
        Relationships: []
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
