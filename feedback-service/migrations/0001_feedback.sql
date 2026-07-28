CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '',
  diagnostics_json TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx
ON feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_status_idx
ON feedback(status, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  client_hash TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
