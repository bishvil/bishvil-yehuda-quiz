export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GameModeEnum = "sync" | "async";
export type SessionStatusEnum = "draft" | "scheduled" | "live" | "paused" | "ended";
export type ParticipantStatusEnum = "joined" | "in_progress" | "completed";
export type QuestionTypeEnum = "single" | "multi" | "truefalse" | "image" | "map";
export type QuestionStatusEnum =
  | "idle"
  | "presenting"
  | "answering"
  | "locked"
  | "revealed";
export type AsyncQuestionStatusEnum = "answering" | "locked" | "revealed";

export interface QuestionOption {
  id: string;
  text: string;
  image_url?: string;
}

export interface QuestionMap {
  geo: {
    target: { lat: number; lng: number };
    center?: { lat: number; lng: number };
    zoom?: number;
    toleranceKm: number;
    styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
  };
}

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          quiz_id: string;
          host_id: string | null;
          pin: string;
          status: SessionStatusEnum;
          game_mode: GameModeEnum;
          auto_reveal: boolean;
          current_question_id: string | null;
          started_at: string | null;
          ended_at: string | null;
          host_last_seen_at: string | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          host_id?: string | null;
          pin: string;
          status?: SessionStatusEnum;
          game_mode: GameModeEnum;
          auto_reveal?: boolean;
          current_question_id?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          host_last_seen_at?: string | null;
          created_at?: string;
          archived_at?: string | null;
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
          status: ParticipantStatusEnum;
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
          status?: ParticipantStatusEnum;
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
          default_game_mode: GameModeEnum;
          join_fields: Json;
          custom_logo: string | null;
          custom_logo_label: string | null;
          custom_logo_active: boolean;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          brand_id: string;
          title: string;
          default_game_mode: GameModeEnum;
          join_fields?: Json;
          custom_logo?: string | null;
          custom_logo_label?: string | null;
          custom_logo_active?: boolean;
          created_at?: string;
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quizzes"]["Insert"]>;
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          quiz_id: string;
          ordinal: number;
          type: QuestionTypeEnum;
          prompt: string;
          options: Json | null;
          correct_ids: string[] | null;
          map: Json | null;
          image_url: string | null;
          image_alt: string | null;
          image_width: number | null;
          image_height: number | null;
          /**
           * Supabase Storage object path for question-images uploads.
           * Admin-private — must NOT be exposed in participant or host
           * payloads (ADR-0008). Used by future cleanup jobs to find
           * orphaned objects (ADR-0010 §7).
           */
          image_path: string | null;
          explanation: string | null;
          time_seconds: number;
          points: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          ordinal: number;
          type: QuestionTypeEnum;
          prompt: string;
          options?: Json | null;
          correct_ids?: string[] | null;
          map?: Json | null;
          image_url?: string | null;
          image_alt?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          image_path?: string | null;
          explanation?: string | null;
          time_seconds?: number;
          points?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["questions"]["Insert"]>;
        Relationships: [];
      };
      answers: {
        Row: {
          id: string;
          session_id: string;
          question_id: string;
          participant_id: string;
          submitted_at: string;
          selected_ids: string[] | null;
          /** ADR-0011 §6.3 — geographic pin (degrees). */
          pin_lat: string | null;
          /** ADR-0011 §6.3 — geographic pin (degrees). */
          pin_lng: string | null;
          is_correct: boolean;
          time_bonus: number;
          score: number;
          /**
           * Haversine distance in km between participant pin and correct target.
           * Populated for geo map answers only; null for all other types.
           * ADR-0006 Open Q2 RESOLVED.
           */
          distance_km: string | null;
          /**
           * 0..1 correctness ratio. Populated for geo map and multi-select.
           * Null for single / truefalse / image.
           * ADR-0006 Open Q3 RESOLVED.
           */
          correctness_ratio: string | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          question_id: string;
          participant_id: string;
          submitted_at?: string;
          selected_ids?: string[] | null;
          pin_lat?: string | null;
          pin_lng?: string | null;
          is_correct: boolean;
          time_bonus?: number;
          score?: number;
          distance_km?: string | null;
          correctness_ratio?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["answers"]["Insert"]>;
        Relationships: [];
      };
      question_session_state: {
        Row: {
          session_id: string;
          question_id: string;
          question_index: number;
          status: QuestionStatusEnum;
          presenting_at: string | null;
          started_at: string | null;
          deadline_at: string | null;
          revealed_at: string | null;
        };
        Insert: {
          session_id: string;
          question_id: string;
          question_index: number;
          status?: QuestionStatusEnum;
          presenting_at?: string | null;
          started_at?: string | null;
          deadline_at?: string | null;
          revealed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["question_session_state"]["Insert"]>;
        Relationships: [];
      };
      participant_question_progress: {
        Row: {
          session_id: string;
          participant_id: string;
          question_id: string;
          question_index: number;
          status: AsyncQuestionStatusEnum;
          started_at: string;
          deadline_at: string;
          revealed_at: string | null;
        };
        Insert: {
          session_id: string;
          participant_id: string;
          question_id: string;
          question_index: number;
          status: AsyncQuestionStatusEnum;
          started_at: string;
          deadline_at: string;
          revealed_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["participant_question_progress"]["Insert"]
        >;
        Relationships: [];
      };
      participant_scores: {
        Row: {
          session_id: string;
          participant_id: string;
          total_score: number;
          correct_count: number;
          last_updated_at: string;
        };
        Insert: {
          session_id: string;
          participant_id: string;
          total_score?: number;
          correct_count?: number;
          last_updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["participant_scores"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_answer: {
        Args: {
          p_session_id: string;
          p_participant_id: string;
          p_question_id: string;
          p_selected_ids?: string[] | null;
          /** ADR-0011 §5 — geographic pin (degrees, WGS-84). */
          p_pin_lat?: number | null;
          /** ADR-0011 §5 — geographic pin (degrees, WGS-84). */
          p_pin_lng?: number | null;
        };
        Returns: Array<{
          result_status: string;
          inserted: boolean | null;
          answer_id: string | null;
          session_id: string | null;
          question_id: string | null;
          participant_id: string | null;
          submitted_at: string | null;
          selected_ids: string[] | null;
          pin_lat: string | null;
          pin_lng: string | null;
          is_correct: boolean | null;
          time_bonus: number | null;
          score: number | null;
          /** Haversine distance in km — populated for geo map answers. */
          distance_km: string | null;
          /**
           * 0..1 correctness ratio — populated for geo map and multi-select.
           * Null for single / truefalse / image.
           */
          correctness_ratio: string | null;
          question_status: string | null;
          deadline_at: string | null;
          correct_ids: string[] | null;
          explanation: string | null;
        }>;
      };
      rescore_session: {
        Args: {
          p_session_id: string;
        };
        Returns: Array<{
          answers_rescored: number | null;
          total_score_delta: number | null;
          participants_touched: number | null;
        }>;
      };
    };
    Enums: {
      game_mode: GameModeEnum;
      participant_status: ParticipantStatusEnum;
      session_status: SessionStatusEnum;
      question_type: QuestionTypeEnum;
      question_status: QuestionStatusEnum;
      async_question_status: AsyncQuestionStatusEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}
