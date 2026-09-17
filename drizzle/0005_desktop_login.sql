CREATE TABLE desktop_logins (id TEXT PRIMARY KEY NOT NULL, challenge TEXT NOT NULL, source TEXT NOT NULL, user_id TEXT, expires_at INTEGER NOT NULL);
CREATE INDEX idx_desktop_login_source ON desktop_logins(source, expires_at);
