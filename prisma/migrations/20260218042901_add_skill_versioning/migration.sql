-- CreateTable
CREATE TABLE `skills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `summary` TEXT NOT NULL,
    `inputs` TEXT NOT NULL,
    `outputs` TEXT NOT NULL,
    `steps` JSON NOT NULL,
    `risks` TEXT NOT NULL,
    `triggers` JSON NOT NULL,
    `guardrails` JSON NOT NULL,
    `tests` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(150) NOT NULL DEFAULT 'SYS',
    `updated_by` VARCHAR(150) NOT NULL DEFAULT 'SYS',

    UNIQUE INDEX `skills_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_drafts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `draft_key` VARCHAR(120) NOT NULL,
    `mode` VARCHAR(20) NOT NULL,
    `skill_id` INTEGER NULL,
    `payload` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `skill_drafts_draft_key_key`(`draft_key`),
    INDEX `skill_drafts_updated_at_idx`(`updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `skill_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `skill_versions_skill_id_created_at_idx`(`skill_id`, `created_at`),
    UNIQUE INDEX `skill_versions_skill_id_version_key`(`skill_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_publications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `skill_id` INTEGER NOT NULL,
    `skill_version_id` INTEGER NOT NULL,
    `note` TEXT NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `skill_publications_skill_id_published_at_idx`(`skill_id`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(150) NOT NULL DEFAULT 'SYS',
    `updated_by` VARCHAR(150) NOT NULL DEFAULT 'SYS',

    UNIQUE INDEX `tags_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `skill_id` INTEGER NOT NULL,
    `path` VARCHAR(500) NOT NULL,
    `mime` VARCHAR(200) NOT NULL,
    `is_binary` BOOLEAN NOT NULL DEFAULT false,
    `content_text` MEDIUMTEXT NULL,
    `content_bytes` MEDIUMBLOB NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `skill_files_skill_id_path_key`(`skill_id`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_tags` (
    `skill_id` INTEGER NOT NULL,
    `tag_id` INTEGER NOT NULL,

    PRIMARY KEY (`skill_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `skill_drafts` ADD CONSTRAINT `skill_drafts_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_versions` ADD CONSTRAINT `skill_versions_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_publications` ADD CONSTRAINT `skill_publications_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_publications` ADD CONSTRAINT `skill_publications_skill_version_id_fkey` FOREIGN KEY (`skill_version_id`) REFERENCES `skill_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_files` ADD CONSTRAINT `skill_files_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_tags` ADD CONSTRAINT `skill_tags_skill_id_fkey` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_tags` ADD CONSTRAINT `skill_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
