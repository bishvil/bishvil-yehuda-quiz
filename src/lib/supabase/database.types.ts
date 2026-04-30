export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          quiz_id: string;
          host_id: string | null;
          pin: string;
          status: "draft" | "scheduled" | "live" | "paused" | "ended";
          game_mode: "sync" | "async";
          auto_reveal: boolean;
          current_question_id: string | null;
          started_at: string | null;
          ended_at: string | null;
          host_last_seen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          host_id?: string | null;
          pin: string;
          status?: "draft" | "scheduled" | "live" | "paused" | "ended";
          game_mode: "sync" | "async";
          auto_reveal?: boolean;
          current_question_id?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          host_last_seen_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      session_participants: {
        Row: {
          id: string;
          session_id: string;
          first_name: string;
          last_name: string;
          phone: string;
          unit: string | null;
          team: string | null;
          status: "joined" | "in_progress" | "completed";
          streak: number;
          joined_at: string;
          display_name: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          first_name: string;
          last_name: string;
          phone: string;
          unit?: string | null;
          team?: string | null;
          status?: "joined" | "in_progress" | "completed";
          streak?: number;
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_participants"]["Insert"]>;
        Relationships: [];
      };
      quizzes: {
        Row: {
          id: string;
          owner_id: string;
          brand_id: string;
          title: string;
          default_game_mode: "sync" | "async";
          join_fields: Json;
          custom_logo: string | null;
          custom_logo_label: string | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          brand_id: string;
          title: string;
          default_game_mode: "sync" | "async";
          join_fields?: Json;
          custom_logo?: string | null;
          custom_logo_label?: string | null;
          created_at?: string;
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quizzes"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      game_mode: "sync" | "async";
      participant_status: "joined" | "in_progress" | "completed";
      session_status: "draft" | "scheduled" | "live" | "paused" | "ended";
    };
    CompositeTypes: Record<string, never>;
  };
}
