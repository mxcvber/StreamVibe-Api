-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN     "failed_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
