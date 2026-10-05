-- Players are anonymous: a random id kept in their browser.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

-- Channels made from a briefing. The bible stays signed, so it can be handed out again unchanged.
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  level TEXT NOT NULL,
  brief TEXT NOT NULL,
  bible TEXT NOT NULL,
  display TEXT NOT NULL,
  sig TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- The owner removed it from their list.
  removed_at INTEGER,
  -- An admin took it off the air: the live feed refuses it.
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX channels_owner ON channels (owner);
CREATE INDEX channels_created ON channels (created_at);

-- One saved session per player and channel (preset or made), as the browser keeps it.
CREATE TABLE sessions (
  player TEXT NOT NULL,
  channel TEXT NOT NULL,
  data TEXT NOT NULL,
  phase TEXT NOT NULL,
  transmissions INTEGER NOT NULL,
  outcome TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player, channel)
);
CREATE INDEX sessions_updated ON sessions (updated_at);
CREATE INDEX sessions_channel ON sessions (channel);

-- Requests per day, player and route, to see what the site costs and who uses it most.
CREATE TABLE usage (
  day TEXT NOT NULL,
  player TEXT NOT NULL,
  route TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, player, route)
);
CREATE INDEX usage_player ON usage (player);
