-- Migration: add_digest_unsubscribe
-- Created: 2026-03-29
-- Stores email addresses that have opted out of the daily operator digest.

CREATE TABLE IF NOT EXISTS "DigestUnsubscribe" (
    "email"     TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigestUnsubscribe_pkey" PRIMARY KEY ("email")
);
