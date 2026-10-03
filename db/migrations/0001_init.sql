-- GLIX community: accounts, roles, a generic post/asset model for the gallery,
-- reactions, comments, reports, admin settings and an audit trail.
--
-- Ids are text (time-sortable, made by the app) so rows can move to another
-- system without renumbering. Counters on posts/comments are recomputed from
-- their source rows on every change, never incremented, so they cannot drift.

CREATE TABLE schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id text PRIMARY KEY,
    email text NOT NULL,
    email_verified_at timestamptz,
    handle text NOT NULL,
    display_name text NOT NULL DEFAULT '',
    bio text NOT NULL DEFAULT '',
    avatar_url text,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'trusted', 'moderator', 'admin')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_handle_key ON users (lower(handle));

-- How a user signs in, one row per method: 'password' today; OAuth or an
-- external identity provider later adds rows here without touching users.
CREATE TABLE accounts (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    -- 'pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>' for provider 'password'
    password_hash text,
    data jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_account_id)
);
CREATE INDEX accounts_user_idx ON accounts (user_id);

-- id is the SHA-256 of the cookie token: a leaked table holds no usable session
CREATE TABLE sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    ip text,
    user_agent text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- A post is anything shown in the gallery. kind says what it is ('image',
-- 'animation', 'video', ...); its files are assets, an editor project among them.
CREATE TABLE posts (
    id text PRIMARY KEY,
    author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind text NOT NULL,
    title text NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'hidden', 'removed')),
    visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
    tags text[] NOT NULL DEFAULT '{}',
    -- free-form: codec settings, preset, wavelet, source app, ...
    metadata jsonb NOT NULL DEFAULT '{}',
    -- denormalised from the cover asset for masonry layout without a join
    cover_width integer,
    cover_height integer,
    reaction_count integer NOT NULL DEFAULT 0,
    comment_count integer NOT NULL DEFAULT 0,
    view_count integer NOT NULL DEFAULT 0,
    moderation_note text,
    moderated_by text REFERENCES users (id) ON DELETE SET NULL,
    moderated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX posts_feed_idx ON posts (status, visibility, published_at DESC, id DESC);
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC);
CREATE INDEX posts_kind_idx ON posts (kind);
CREATE INDEX posts_tags_idx ON posts USING gin (tags);

-- A stored file. role: 'primary' (what the post shows), 'preview' (a smaller
-- rendition for grids), 'project' (an editor project bundle), 'attachment'.
CREATE TABLE assets (
    id text PRIMARY KEY,
    owner_id text REFERENCES users (id) ON DELETE SET NULL,
    post_id text REFERENCES posts (id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'primary',
    position integer NOT NULL DEFAULT 0,
    storage_key text NOT NULL UNIQUE,
    mime text NOT NULL,
    bytes bigint NOT NULL,
    width integer,
    height integer,
    duration_ms integer,
    sha256 text,
    -- original file name/type/size and how it was transcoded, if it was
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_post_idx ON assets (post_id, role, position);
CREATE INDEX assets_owner_idx ON assets (owner_id);

CREATE TABLE comments (
    id text PRIMARY KEY,
    post_id text NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    author_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    parent_id text REFERENCES comments (id) ON DELETE CASCADE,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'hidden', 'removed')),
    reaction_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at);
CREATE INDEX comments_author_idx ON comments (author_id);

-- Emoji reactions on anything (posts and comments today). A user can leave
-- several different emoji on one target, each once.
CREATE TABLE reactions (
    target_type text NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id text NOT NULL,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (target_type, target_id, user_id, emoji)
);
CREATE INDEX reactions_target_idx ON reactions (target_type, target_id);
CREATE INDEX reactions_user_idx ON reactions (user_id);

CREATE TABLE reports (
    id text PRIMARY KEY,
    target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
    target_id text NOT NULL,
    reporter_id text REFERENCES users (id) ON DELETE SET NULL,
    reason text NOT NULL,
    details text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolution text,
    resolved_by text REFERENCES users (id) ON DELETE SET NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX reports_target_idx ON reports (target_type, target_id);
CREATE UNIQUE INDEX reports_once_idx ON reports (target_type, target_id, reporter_id) WHERE status = 'open';

-- Admin-editable switches (moderation modes, limits, emoji set). Missing keys
-- fall back to the defaults in code.
CREATE TABLE settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE audit_log (
    id text PRIMARY KEY,
    actor_id text REFERENCES users (id) ON DELETE SET NULL,
    action text NOT NULL,
    target_type text,
    target_id text,
    data jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

-- Fixed-window counters for rate limits (logins, uploads, comments).
CREATE TABLE rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count integer NOT NULL
);

INSERT INTO schema_migrations (version) VALUES ('0001_init');
