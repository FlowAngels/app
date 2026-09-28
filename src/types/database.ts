export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type RoomStatus = 'lobby' | 'inRound' | 'results' | 'ended'

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string
          status: RoomStatus
          host_device_id: string
          category_pool: Json
          round_index: number
          total_rounds: number
          leaderboards: Json
          created_at: string
        }
        Insert: {
          id: string
          status?: RoomStatus
          host_device_id: string
          category_pool?: Json
          round_index?: number
          total_rounds?: number
          leaderboards?: Json
          created_at?: string
        }
        Update: {
          id?: string
          status?: RoomStatus
          host_device_id?: string
          category_pool?: Json
          round_index?: number
          total_rounds?: number
          leaderboards?: Json
          created_at?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          id: string
          room_id: string
          name: string
          avatar: string
          connected: boolean
          selected_categories: Json
        }
        Insert: {
          id?: string
          room_id: string
          name: string
          avatar: string
          connected?: boolean
          selected_categories?: Json
        }
        Update: {
          id?: string
          room_id?: string
          name?: string
          avatar?: string
          connected?: boolean
          selected_categories?: Json
        }
        Relationships: []
      }
      rounds: {
        Row: {
          id: string
          room_id: string
          owner_id: string | null
          category: string
          prompt: Json
          deadline: string | null
          reveal_order: Json
          results: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          owner_id?: string | null
          category: string
          prompt: Json
          deadline?: string | null
          reveal_order?: Json
          results?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          owner_id?: string | null
          category?: string
          prompt?: Json
          deadline?: string | null
          reveal_order?: Json
          results?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: { id: string; round_id: string; player_id: string; text: string }
        Insert: { id?: string; round_id: string; player_id: string; text: string }
        Update: { id?: string; round_id?: string; player_id?: string; text?: string }
        Relationships: []
      }
      guesses: {
        Row: { id: string; round_id: string; player_id: string; answer_id: string }
        Insert: { id?: string; round_id: string; player_id: string; answer_id: string }
        Update: { id?: string; round_id?: string; player_id?: string; answer_id?: string }
        Relationships: []
      }
      votes: {
        Row: { id: string; round_id: string; player_id: string; answer_id: string }
        Insert: { id?: string; round_id: string; player_id: string; answer_id: string }
        Update: { id?: string; round_id?: string; player_id?: string; answer_id?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
