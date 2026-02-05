-- Add unique constraint for feedback toggling
CREATE UNIQUE INDEX "Feedback_userId_itemType_itemId_key"
ON "Feedback"("userId", "itemType", "itemId");
