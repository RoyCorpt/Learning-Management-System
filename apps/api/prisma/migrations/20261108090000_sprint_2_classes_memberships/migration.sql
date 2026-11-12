CREATE TYPE "ClassStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "status" "ClassStatus" NOT NULL DEFAULT 'OPEN',
    "invitation_code_hash" CHAR(64),
    "invitation_code_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classes_invitation_code_hash_key" ON "classes"("invitation_code_hash");
CREATE INDEX "classes_owner_id_status_created_at_id_idx" ON "classes"("owner_id", "status", "created_at", "id");
CREATE UNIQUE INDEX "memberships_class_id_user_id_key" ON "memberships"("class_id", "user_id");
CREATE INDEX "memberships_user_id_created_at_id_idx" ON "memberships"("user_id", "created_at", "id");
CREATE INDEX "memberships_class_id_created_at_id_idx" ON "memberships"("class_id", "created_at", "id");

ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
