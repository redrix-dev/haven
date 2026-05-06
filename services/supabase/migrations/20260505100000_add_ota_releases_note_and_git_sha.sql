-- OTA deploy metadata: human-readable note + exact repo revision.
-- Skips if public.ota_releases is missing (e.g. some local DB snapshots).

DO $$
BEGIN
  IF to_regclass('public.ota_releases') IS NULL THEN
    RAISE NOTICE 'ota_releases not found; skipping OTA metadata columns migration.';
  ELSE
    ALTER TABLE public.ota_releases
      ADD COLUMN IF NOT EXISTS ota_release_note text,
      ADD COLUMN IF NOT EXISTS git_sha text;

    UPDATE public.ota_releases
    SET ota_release_note = '(legacy OTA; no note recorded)'
    WHERE ota_release_note IS NULL;

    UPDATE public.ota_releases
    SET git_sha = 'unknown'
    WHERE git_sha IS NULL;

    ALTER TABLE public.ota_releases
      ALTER COLUMN ota_release_note SET NOT NULL,
      ALTER COLUMN git_sha SET NOT NULL;
  END IF;
END $$;
