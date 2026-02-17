export type SqlMigration = {
  id: string
  statements: string[]
}

/**
 * Keeps schema evolution explicit and append-only so production state upgrades remain
 * deterministic and auditable across releases.
 */
export const SQL_MIGRATIONS: SqlMigration[] = [
  {
    id: "001_schema_migrations",
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: "002_session_bindings",
    statements: [
      `CREATE TABLE IF NOT EXISTS session_bindings (
        binding_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: "003_messages_in",
    statements: [
      `CREATE TABLE IF NOT EXISTS messages_in (
        id TEXT PRIMARY KEY,
        source_message_id TEXT NOT NULL UNIQUE,
        chat_id INTEGER NOT NULL,
        user_id INTEGER,
        content TEXT,
        received_at INTEGER NOT NULL,
        session_id TEXT,
        created_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: "004_messages_out",
    statements: [
      `CREATE TABLE IF NOT EXISTS messages_out (
        id TEXT PRIMARY KEY,
        dedupe_key TEXT UNIQUE,
        chat_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER,
        sent_at INTEGER,
        failed_at INTEGER,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_messages_out_status_next_attempt
       ON messages_out (status, next_attempt_at)`,
    ],
  },
  {
    id: "005_jobs",
    statements: [
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER,
        lock_token TEXT,
        lock_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON jobs (next_run_at)`,
    ],
  },
  {
    id: "006_approvals",
    statements: [
      `CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        expires_at INTEGER,
        resolved_at INTEGER,
        resolution_source TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals (status)`,
    ],
  },
  {
    id: "007_task_observations",
    statements: [
      `CREATE TABLE IF NOT EXISTS task_observations (
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL,
        due_at INTEGER,
        observed_at INTEGER NOT NULL,
        metadata TEXT,
        PRIMARY KEY (provider, external_id)
      )`,
    ],
  },
  {
    id: "008_user_profile",
    statements: [
      `CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        timezone TEXT,
        quiet_hours_start TEXT,
        quiet_hours_end TEXT,
        heartbeat_morning TEXT,
        heartbeat_midday TEXT,
        heartbeat_evening TEXT,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: "009_job_schedule_and_runs",
    statements: [
      `ALTER TABLE jobs ADD COLUMN schedule_type TEXT`,
      `ALTER TABLE jobs ADD COLUMN run_at INTEGER`,
      `ALTER TABLE jobs ADD COLUMN cadence_minutes INTEGER`,
      `ALTER TABLE jobs ADD COLUMN terminal_state TEXT`,
      `ALTER TABLE jobs ADD COLUMN terminal_reason TEXT`,
      `UPDATE jobs
       SET schedule_type = COALESCE(schedule_type, 'recurring'),
           cadence_minutes = CASE
             WHEN cadence_minutes IS NULL AND next_run_at IS NOT NULL THEN 1
             ELSE cadence_minutes
           END,
           run_at = CASE
             WHEN run_at IS NULL AND next_run_at IS NOT NULL THEN next_run_at
             ELSE run_at
           END`,
      `CREATE TABLE IF NOT EXISTS job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        scheduled_for INTEGER,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        result_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_schedule_due ON jobs (status, next_run_at)`,
      `CREATE INDEX IF NOT EXISTS idx_job_runs_job_started_at ON job_runs (job_id, started_at DESC)`,
    ],
  },
]
