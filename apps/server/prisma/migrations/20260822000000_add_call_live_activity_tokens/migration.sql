-- CreateTable
CREATE TABLE "CallLiveActivityToken" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CallLiveActivityToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallLiveActivityToken_call_id_idx" ON "CallLiveActivityToken"("call_id");

-- CreateIndex
CREATE UNIQUE INDEX "CallLiveActivityToken_call_id_push_token_key" ON "CallLiveActivityToken"("call_id", "push_token");

-- AddForeignKey
ALTER TABLE "CallLiveActivityToken" ADD CONSTRAINT "CallLiveActivityToken_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLiveActivityToken" ADD CONSTRAINT "CallLiveActivityToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
