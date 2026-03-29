-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "expenseDate" TIMESTAMP(3),
ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'queued',
ADD COLUMN     "title" TEXT;
