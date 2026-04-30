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
  image_url: string;
  target: { x: number; y: number };
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
          explanation: string | null;
          time_seconds: number;
          points: number;
          tolerance: string | null;
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
          explanation?: string | null;
          time_seconds?: number;
          points?: number;
          tolerance?: string | null;
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
          pin_x: string | null;
          pin_y: string | null;
          is_correct: boolean;
          time_bonus: number;
          score: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          question_id: string;
          participant_id: string;
          submitted_at?: string;
          selected_ids?: string[] | null;
          pin_x?: string | null;
          pin_y?: string | null;
          is_correct: boolean;
          time_bonus?: number;
          score?: number;
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
    Functions: Record<string, never>;
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
