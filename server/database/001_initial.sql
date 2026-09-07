CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, identity_key text NOT NULL UNIQUE, nickname text NOT NULL,
 role text NOT NULL CHECK(role IN ('student','admin')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
 code text PRIMARY KEY, name text NOT NULL
);
CREATE TABLE IF NOT EXISTS offerings (
 id uuid PRIMARY KEY, school text NOT NULL DEFAULT 'fudan', term text NOT NULL,
 section text NOT NULL, code text NOT NULL REFERENCES courses(code), payload jsonb NOT NULL,
 categories jsonb NOT NULL, attendance text NOT NULL DEFAULT 'gray' CHECK(attendance IN ('red','yellow','green','gray')),
 UNIQUE(school,term,section)
);
CREATE TABLE IF NOT EXISTS enrollments (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 offering_id uuid NOT NULL REFERENCES offerings(id), category text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,offering_id)
);
CREATE INDEX IF NOT EXISTS enrollment_offering ON enrollments(offering_id);
CREATE TABLE IF NOT EXISTS imports (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), term text NOT NULL,
 snapshot jsonb NOT NULL, expires_at timestamptz NOT NULL, committed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS course_changes (
 id uuid PRIMARY KEY, offering_id uuid NOT NULL REFERENCES offerings(id), user_id uuid NOT NULL REFERENCES users(id),
 proposed jsonb NOT NULL, fingerprint text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES users(id), reason text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 UNIQUE(offering_id,fingerprint)
);
CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), offering_id uuid NOT NULL REFERENCES offerings(id),
 color text NOT NULL CHECK(color IN ('red','yellow','green','gray')), note text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_report ON reports(user_id,offering_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS decisions (
 id uuid PRIMARY KEY, offering_id uuid NOT NULL REFERENCES offerings(id), report_id uuid REFERENCES reports(id),
 admin_id uuid NOT NULL REFERENCES users(id), color text NOT NULL CHECK(color IN ('red','yellow','green','gray')),
 action text NOT NULL CHECK(action IN ('approved','rejected','schedule_reset')), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
