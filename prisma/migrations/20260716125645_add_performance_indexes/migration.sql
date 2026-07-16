-- CreateIndex
CREATE INDEX "CommunityChallenge_guildId_endsAt_idx" ON "CommunityChallenge"("guildId", "endsAt");

-- CreateIndex
CREATE INDEX "Goal_userId_status_createdAt_idx" ON "Goal"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Habit_userId_idx" ON "Habit"("userId");

-- CreateIndex
CREATE INDEX "HabitLog_habitId_date_idx" ON "HabitLog"("habitId", "date");

-- CreateIndex
CREATE INDEX "PomodoroSession_userId_status_idx" ON "PomodoroSession"("userId", "status");

-- CreateIndex
CREATE INDEX "Reminder_userId_sent_remindAt_idx" ON "Reminder"("userId", "sent", "remindAt");

-- CreateIndex
CREATE INDEX "Reminder_sent_remindAt_idx" ON "Reminder"("sent", "remindAt");

-- CreateIndex
CREATE INDEX "Todo_userId_done_createdAt_idx" ON "Todo"("userId", "done", "createdAt");

-- CreateIndex
CREATE INDEX "XPLog_userId_createdAt_idx" ON "XPLog"("userId", "createdAt");
