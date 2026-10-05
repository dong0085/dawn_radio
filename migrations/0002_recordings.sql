-- Recordings people saved: a copy of a session at the moment they saved it, kept with its audio
-- (R2: saved/<player>/<recording>/<audio key>.wav). Starting the channel fresh leaves them alone.
CREATE TABLE recordings (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  -- The session it was saved from: a channel id, plus "@<language>" when heard in another one.
  session TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  transmissions INTEGER NOT NULL,
  outcome TEXT,
  -- Seconds on the channel.
  elapsed REAL NOT NULL DEFAULT 0,
  -- Lines whose audio was kept (older than a day, or spoken by the device voice, have none).
  audio_lines INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX recordings_player ON recordings (player, updated_at);
