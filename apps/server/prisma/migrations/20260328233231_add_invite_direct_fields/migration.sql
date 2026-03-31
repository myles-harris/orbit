-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'dismissed');

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "invited_user_id" TEXT,
ADD COLUMN     "responded_at" TIMESTAMPTZ(6),
ADD COLUMN     "status" "InviteStatus",
ALTER COLUMN "code" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Invite_invited_user_id_idx" ON "Invite"("invited_user_id");

-- CreateIndex
CREATE INDEX "Invite_status_idx" ON "Invite"("status");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
