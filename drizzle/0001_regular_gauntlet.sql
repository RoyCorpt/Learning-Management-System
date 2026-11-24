ALTER TABLE "assignments" ADD COLUMN "external_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "attachment_mime" varchar(120);--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "attachment_size" integer;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "attachment_data" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "external_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "attachment_mime" varchar(120);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "attachment_size" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "attachment_data" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "external_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "attachment_mime" varchar(120);--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "attachment_size" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "attachment_data" text;