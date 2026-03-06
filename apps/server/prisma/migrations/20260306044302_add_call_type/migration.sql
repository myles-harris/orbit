/*
  Warnings:

  - Added the required column `call_type` to the `CallSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('spontaneous', 'scheduled');

-- AlterTable
ALTER TABLE "CallSession" ADD COLUMN     "call_type" "CallType" NOT NULL DEFAULT 'spontaneous';

-- CreateIndex
CREATE INDEX "CallSession_call_type_idx" ON "CallSession"("call_type");
