-- ============================================================
-- Moderation Platform Schema
-- Adds platform-level content flags, report linking, and
-- propagation trigger for haven_staff → server_admins rows.
-- ============================================================

-- 1. Platform visibility flags on messages
--    platform_quarantined_at: content removed by staff (row content cleared, irreversible)
--    platform_expunged_at:    user platform-ban sweep (content preserved, user presence removed)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS platform_quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform_expunged_at    timestamptz;

-- 2. Support report linking and platform action metadata
--    source_report_id: links a haven_staff row back to its paired server_admins row
--    platform_action:  JSONB written by staff when they act; trigger propagates to linked row
ALTER TABLE support_reports
  ADD COLUMN IF NOT EXISTS source_report_id uuid REFERENCES support_reports(id),
  ADD COLUMN IF NOT EXISTS platform_action   jsonb;

-- 3. Add resolved_by_platform to the support_report_status enum
ALTER TYPE support_report_status ADD VALUE IF NOT EXISTS 'resolved_by_platform';

-- 4. Split existing destination='both' rows into two independent rows.
--    The server_admins row keeps the original id.
--    The haven_staff row gets a new id with source_report_id pointing back.
DO $$
DECLARE
  r support_reports%ROWTYPE;
  new_id uuid;
BEGIN
  FOR r IN SELECT * FROM support_reports WHERE destination = 'both' LOOP
    new_id := gen_random_uuid();

    -- Insert the haven_staff counterpart
    INSERT INTO support_reports (
      id,
      community_id,
      reporter_user_id,
      status,
      title,
      notes,
      snapshot,
      include_last_n_messages,
      destination,
      source_report_id,
      created_at,
      updated_at
    ) VALUES (
      new_id,
      r.community_id,
      r.reporter_user_id,
      r.status,
      r.title,
      r.notes,
      r.snapshot,
      r.include_last_n_messages,
      'haven_staff',
      r.id,  -- links back to the server_admins row (original id)
      r.created_at,
      r.updated_at
    );

    -- Copy channel links
    INSERT INTO support_report_channels (report_id, community_id, channel_id)
    SELECT new_id, community_id, channel_id
    FROM support_report_channels
    WHERE report_id = r.id
    ON CONFLICT DO NOTHING;

    -- Copy message links
    INSERT INTO support_report_messages (report_id, message_id)
    SELECT new_id, message_id
    FROM support_report_messages
    WHERE report_id = r.id
    ON CONFLICT DO NOTHING;

    -- Reclassify the original row as server_admins
    UPDATE support_reports
    SET destination = 'server_admins', updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 5. Trigger: when a haven_staff row with source_report_id gets platform_action written,
--    propagate it to the linked server_admins row and update status where appropriate.
CREATE OR REPLACE FUNCTION propagate_platform_action()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source_report_id IS NOT NULL
     AND NEW.platform_action IS NOT NULL
     AND (OLD.platform_action IS NULL OR OLD.platform_action::text != NEW.platform_action::text)
  THEN
    UPDATE support_reports
    SET
      platform_action = NEW.platform_action,
      status = CASE
        WHEN (NEW.platform_action->>'user_banned')::boolean IS TRUE
         AND (NEW.platform_action->>'content_removed')::boolean IS TRUE
        THEN 'resolved_by_platform'::support_report_status
        ELSE status
      END,
      updated_at = now()
    WHERE id = NEW.source_report_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propagate_platform_action ON support_reports;
CREATE TRIGGER trg_propagate_platform_action
AFTER UPDATE ON support_reports
FOR EACH ROW
WHEN (NEW.destination = 'haven_staff')
EXECUTE FUNCTION propagate_platform_action();
