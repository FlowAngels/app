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
          host_user_id: string | null
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
          host_user_id?: string | null
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
          host_user_id?: string | null
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
          created_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          room_id: string
          name: string
          avatar: string
          connected?: boolean
          selected_categories?: Json
          created_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          name?: string
          avatar?: string
          connected?: boolean
          selected_categories?: Json
          created_at?: string
          user_id?: string | null
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
          phase: 'prompt' | 'responding' | 'guessing' | 'results'
          vote_deadline: string | null
          finalized_at: string | null
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
          phase?: 'prompt' | 'responding' | 'guessing' | 'results'
          vote_deadline?: string | null
          finalized_at?: string | null
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
          phase?: 'prompt' | 'responding' | 'guessing' | 'results'
          vote_deadline?: string | null
          finalized_at?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: { id: string; round_id: string; player_id: string; text: string; created_at: string }
        Insert: { id?: string; round_id: string; player_id: string; text: string; created_at?: string }
        Update: { id?: string; round_id?: string; player_id?: string; text?: string; created_at?: string }
        Relationships: []
      }
      guesses: {
        Row: { id: string; round_id: string; player_id: string; answer_id: string; created_at: string }
        Insert: { id?: string; round_id: string; player_id: string; answer_id: string; created_at?: string }
        Update: { id?: string; round_id?: string; player_id?: string; answer_id?: string; created_at?: string }
        Relationships: []
      }
      votes: {
        Row: { id: string; round_id: string; player_id: string; answer_id: string; created_at: string }
        Insert: { id?: string; round_id: string; player_id: string; answer_id: string; created_at?: string }
        Update: { id?: string; round_id?: string; player_id?: string; answer_id?: string; created_at?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
