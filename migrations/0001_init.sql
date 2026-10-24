-- Usuarios con acceso. `active = 1` entra en la política de Cloudflare Access.
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Catálogo de recursos: `data` es el JSON validado con resourceSchema.
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT
);
CREATE INDEX audit_ts ON audit (ts DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
