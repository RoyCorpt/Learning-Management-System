-- Initial LMS PTIK identity and student roster tables.
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOSEN', 'MAHASISWA');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "full_name" VARCHAR(150) NOT NULL,
  "role" "Role" NOT NULL,
  "status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
  "auth_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "student_roster" (
  "id" UUID NOT NULL,
  "nim" VARCHAR(30) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "full_name" VARCHAR(150) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_roster_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_roster_nim_key" ON "student_roster"("nim");
CREATE UNIQUE INDEX "student_roster_email_key" ON "student_roster"("email");
