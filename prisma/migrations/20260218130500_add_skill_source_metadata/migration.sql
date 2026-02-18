-- Add source metadata for upstream-managed skills
ALTER TABLE `skills`
  ADD COLUMN `source_repo` VARCHAR(191) NULL,
  ADD COLUMN `source_path` VARCHAR(500) NULL,
  ADD COLUMN `source_ref` VARCHAR(120) NULL,
  ADD COLUMN `source_sha` VARCHAR(191) NULL,
  ADD COLUMN `source_managed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `last_synced_at` DATETIME(3) NULL;

ALTER TABLE `skill_files`
  ADD COLUMN `source_path` VARCHAR(500) NULL,
  ADD COLUMN `source_sha` VARCHAR(191) NULL;
