/*
  Warnings:

  - Made the column `trailer_key` on table `movies` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "movies" ALTER COLUMN "trailer_key" SET NOT NULL;
