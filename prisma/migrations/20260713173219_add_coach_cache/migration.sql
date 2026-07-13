-- CreateTable
CREATE TABLE "CoachCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachCache_userId_key" ON "CoachCache"("userId");

-- CreateIndex
CREATE INDEX "CoachCache_userId_idx" ON "CoachCache"("userId");

-- AddForeignKey
ALTER TABLE "CoachCache" ADD CONSTRAINT "CoachCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
