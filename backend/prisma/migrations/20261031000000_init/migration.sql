-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NULL,
    `auth_provider` ENUM('LOCAL', 'GOOGLE') NOT NULL DEFAULT 'LOCAL',
    `google_sub` VARCHAR(64) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_google_sub_key`(`google_sub`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_profiles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `full_name` VARCHAR(150) NULL,
    `avatar_url` VARCHAR(512) NULL,
    `preferences` JSON NULL,

    UNIQUE INDEX `user_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `family_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_family_id_idx`(`family_id`),
    INDEX `refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transcription_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `guest_token_hash` CHAR(64) NULL,
    `original_file_name` VARCHAR(255) NOT NULL,
    `file_format` VARCHAR(16) NOT NULL,
    `duration_seconds` DECIMAL(10, 3) NULL,
    `file_size_bytes` BIGINT NOT NULL,
    `storage_path` VARCHAR(512) NULL,
    `audio_expires_at` DATETIME(3) NOT NULL,
    `is_audio_purged` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `source_language` VARCHAR(10) NULL,
    `error_message` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transcription_sessions_guest_token_hash_key`(`guest_token_hash`),
    INDEX `transcription_sessions_user_id_idx`(`user_id`),
    INDEX `transcription_sessions_status_idx`(`status`),
    INDEX `transcription_sessions_audio_expires_at_is_audio_purged_idx`(`audio_expires_at`, `is_audio_purged`),
    INDEX `transcription_sessions_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `speakers` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `label` VARCHAR(50) NOT NULL,
    `custom_name` VARCHAR(100) NULL,

    INDEX `speakers_session_id_idx`(`session_id`),
    UNIQUE INDEX `speakers_session_id_label_key`(`session_id`, `label`),
    UNIQUE INDEX `speakers_id_session_id_key`(`id`, `session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transcription_segments` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `speaker_id` CHAR(36) NOT NULL,
    `start_time_ms` INTEGER NOT NULL,
    `end_time_ms` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `confidence_score` DECIMAL(4, 3) NULL,

    INDEX `transcription_segments_session_id_start_time_ms_idx`(`session_id`, `start_time_ms`),
    INDEX `transcription_segments_speaker_id_idx`(`speaker_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `translations` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `target_language` VARCHAR(10) NOT NULL,
    `translated_text` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `translations_session_id_idx`(`session_id`),
    UNIQUE INDEX `translations_session_id_target_language_key`(`session_id`, `target_language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_replaced_by_id_fkey` FOREIGN KEY (`replaced_by_id`) REFERENCES `refresh_tokens`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcription_sessions` ADD CONSTRAINT `transcription_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `speakers` ADD CONSTRAINT `speakers_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `transcription_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcription_segments` ADD CONSTRAINT `transcription_segments_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `transcription_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcription_segments` ADD CONSTRAINT `transcription_segments_speaker_id_fkey` FOREIGN KEY (`speaker_id`) REFERENCES `speakers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `translations` ADD CONSTRAINT `translations_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `transcription_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Restricciones de integridad temporal de los segmentos (no expresables en Prisma)
ALTER TABLE `transcription_segments`
  ADD CONSTRAINT `chk_segment_start_non_negative` CHECK (`start_time_ms` >= 0),
  ADD CONSTRAINT `chk_segment_end_after_start` CHECK (`end_time_ms` > `start_time_ms`);
