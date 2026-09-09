ALTER TABLE users ADD COLUMN auth_provider text NOT NULL DEFAULT 'uis' CHECK(auth_provider IN ('uis','local'));
CREATE TABLE admin_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id), username text NOT NULL UNIQUE,
 password_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 failed_attempts integer NOT NULL DEFAULT 0, blocked_until timestamptz
);
