-- Preserve the former roster-active values as eligibility while naming that
-- concept explicitly. User activation remains stored only on users.status.
ALTER TABLE "student_roster" RENAME COLUMN "active" TO "registration_eligible";
ALTER TABLE "student_roster" ALTER COLUMN "registration_eligible" SET DEFAULT false;

ALTER TABLE "student_roster" ADD COLUMN "registered_at" TIMESTAMP(3);
ALTER TABLE "student_roster" ADD COLUMN "registered_user_id" UUID;

CREATE UNIQUE INDEX "student_roster_registered_user_id_key" ON "student_roster"("registered_user_id");

ALTER TABLE "student_roster" ADD CONSTRAINT "student_roster_registered_user_id_fkey"
  FOREIGN KEY ("registered_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
