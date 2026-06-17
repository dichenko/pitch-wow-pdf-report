CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  assistant_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  status TEXT NOT NULL,
  public_token TEXT NOT NULL UNIQUE,
  public_url TEXT,
  input_json_path TEXT NOT NULL,
  rendered_html_path TEXT,
  pdf_path TEXT,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_assistant_id ON jobs (assistant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_public_token ON jobs (public_token);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs (expires_at);

CREATE TABLE IF NOT EXISTS assistants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL,
  default_template_id TEXT NOT NULL,
  default_template_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
