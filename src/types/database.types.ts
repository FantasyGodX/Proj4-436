export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      quests: {
        Row: {
          claimed_by: string | null
          created_at: string
          description: string | null
          difficulty: string
          id: string
          reward_gold: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string
          id?: string
          reward_gold?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string
          id?: string
          reward_gold?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']
