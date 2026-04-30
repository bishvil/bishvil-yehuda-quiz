CREATE TYPE "public"."async_question_status" AS ENUM('answering', 'locked', 'revealed');--> statement-breakpoint
CREATE TYPE "public"."game_mode" AS ENUM('sync', 'async');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('joined', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('idle', 'presenting', 'answering', 'locked', 'revealed');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single', 'multi', 'truefalse', 'image', 'map');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('draft', 'scheduled', 'live', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selected_ids" text[],
	"pin_x" numeric(6, 3),
	"pin_y" numeric(6, 3),
	"is_correct" boolean NOT NULL,
	"time_bonus" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_scores" (
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_scores_session_id_participant_id_pk" PRIMARY KEY("session_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"unit" text,
	"team" text,
	"status" "participant_status" DEFAULT 'joined' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text GENERATED ALWAYS AS ("first_name" || ' ' || left("last_name", 1) || '.') STORED NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_question_progress" (
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"status" "async_question_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"revealed_at" timestamp with time zone,
	CONSTRAINT "participant_question_progress_session_participant_question_pk" PRIMARY KEY("session_id","participant_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "question_session_state" (
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"status" "question_status" DEFAULT 'idle' NOT NULL,
	"presenting_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	CONSTRAINT "question_session_state_session_id_question_id_pk" PRIMARY KEY("session_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct_ids" text[],
	"map" jsonb,
	"image_url" text,
	"explanation" text,
	"time_seconds" integer DEFAULT 25 NOT NULL,
	"points" integer DEFAULT 1500 NOT NULL,
	"tolerance" numeric(6, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"brand_id" text NOT NULL,
	"title" text NOT NULL,
	"default_game_mode" "game_mode" NOT NULL,
	"join_fields" jsonb DEFAULT '["name","phone","unit"]'::jsonb NOT NULL,
	"custom_logo" text,
	"custom_logo_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"host_id" uuid,
	"pin" text NOT NULL,
	"status" "session_status" DEFAULT 'draft' NOT NULL,
	"game_mode" "game_mode" NOT NULL,
	"auto_reveal" boolean DEFAULT false NOT NULL,
	"current_question_id" uuid,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"host_last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_participant_id_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_scores" ADD CONSTRAINT "participant_scores_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_scores" ADD CONSTRAINT "participant_scores_participant_id_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_question_progress" ADD CONSTRAINT "participant_question_progress_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_question_progress" ADD CONSTRAINT "participant_question_progress_participant_id_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_question_progress" ADD CONSTRAINT "participant_question_progress_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_session_state" ADD CONSTRAINT "question_session_state_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_session_state" ADD CONSTRAINT "question_session_state_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_current_question_id_questions_id_fk" FOREIGN KEY ("current_question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_session_question_participant_idx" ON "answers" USING btree ("session_id","question_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_participants_session_id_phone_idx" ON "session_participants" USING btree ("session_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "session_participants_session_id_id_idx" ON "session_participants" USING btree ("session_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_quiz_id_ordinal_idx" ON "questions" USING btree ("quiz_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_pin_active_idx" ON "sessions" USING btree ("pin") WHERE "sessions"."status" in ('scheduled', 'live');--> statement-breakpoint
CREATE INDEX "sessions_quiz_id_idx" ON "sessions" USING btree ("quiz_id");