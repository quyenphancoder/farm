import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
import shopRoutes from "./routes/shop.js";
import { registerOnlineRooms } from "./realtime.js";
import { languageMiddleware } from "./i18n.js";
import { getSocketUser, requestContext, requireAuth } from "./routes/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false
  }
});
const port = process.env.PORT || 3000;

const db = new DatabaseSync(path.join(projectRoot, "database.sqlite"));
db.function("current_player_id", () => {
  const playerId = requestContext.getStore()?.playerId;
  if (!playerId) throw new Error("Missing authenticated player context");
  return playerId;
});
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Nông dân',
    coins INTEGER NOT NULL DEFAULT 500,
    diamonds INTEGER NOT NULL DEFAULT 200,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    unlocked_rows INTEGER NOT NULL DEFAULT 1,
    water_started_at INTEGER,
    is_initialized INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS inventory (
    player_id INTEGER NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, item),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
  CREATE TABLE IF NOT EXISTS farm_state (
    player_id INTEGER NOT NULL,
    plot_id INTEGER NOT NULL,
    crop TEXT,
    planted_at INTEGER,
    watered_at INTEGER,
    treated_at INTEGER,
    PRIMARY KEY (player_id, plot_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
  CREATE TABLE IF NOT EXISTS unlocked_plots (
    player_id INTEGER NOT NULL,
    plot_id INTEGER NOT NULL,
    PRIMARY KEY (player_id, plot_id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
`);

ensurePlayerColumn(db, "diamonds", "INTEGER NOT NULL DEFAULT 200");
ensurePlayerColumn(db, "unlocked_rows", "INTEGER NOT NULL DEFAULT 1");
ensurePlayerColumn(db, "xp", "INTEGER NOT NULL DEFAULT 0");
ensurePlayerColumn(db, "water_started_at", "INTEGER");
ensurePlayerColumn(db, "is_initialized", "INTEGER NOT NULL DEFAULT 0");
ensureFarmStateColumn(db, "watered_at", "INTEGER");
ensureFarmStateColumn(db, "treated_at", "INTEGER");
migratePlotGrid(db);

app.locals.db = db;
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(languageMiddleware);
app.use(express.static(path.join(projectRoot, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api/game", requireAuth, gameRoutes);
app.use("/api/shop", requireAuth, shopRoutes);

io.use((socket, next) => {
  const user = getSocketUser(db, socket.request.headers.cookie);
  if (!user) return next(new Error("Bạn cần đăng nhập."));
  socket.data.user = user;
  next();
});
registerOnlineRooms(io);

httpServer.listen(port, () => {
  console.log(`🌱 Farm game đang chạy tại http://localhost:${port}`);
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

function ensurePlayerColumn(db, name, definition) {
  const columns = db.prepare("PRAGMA table_info(players)").all();
  if (columns.some((column) => column.name === name)) return;
  db.exec(`ALTER TABLE players ADD COLUMN ${name} ${definition}`);
}

function ensureFarmStateColumn(db, name, definition) {
  const columns = db.prepare("PRAGMA table_info(farm_state)").all();
  if (columns.some((column) => column.name === name)) return;
  db.exec(`ALTER TABLE farm_state ADD COLUMN ${name} ${definition}`);
}

function migratePlotGrid(db) {
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version >= 4) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    if (version < 1) {
      for (const table of ["farm_state", "unlocked_plots"]) {
        db.exec(`
          UPDATE ${table}
          SET plot_id = 1000 + CAST(plot_id / 5 AS INTEGER) * 8 + (plot_id % 5)
          WHERE plot_id BETWEEN 0 AND 19;

          UPDATE ${table}
          SET plot_id = plot_id - 1000
          WHERE plot_id >= 1000;
        `);
      }
    }
    if (version < 2) {
      db.exec(`
        INSERT OR IGNORE INTO unlocked_plots (player_id, plot_id)
        SELECT id, 8 FROM players WHERE is_initialized = 1;

        INSERT OR IGNORE INTO unlocked_plots (player_id, plot_id)
        SELECT id, 9 FROM players WHERE is_initialized = 1;
      `);
    }
    if (version < 3) {
      for (const table of ["farm_state", "unlocked_plots"]) {
        db.exec(`
          DELETE FROM ${table}
          WHERE (plot_id % 10) IN (4, 9) AND plot_id BETWEEN 0 AND 49;

          UPDATE ${table}
          SET plot_id = 1000
            + CAST(plot_id / 10 AS INTEGER) * 8
            + CASE
                WHEN (plot_id % 10) < 4 THEN plot_id % 10
                ELSE (plot_id % 10) - 1
              END
          WHERE plot_id BETWEEN 0 AND 49;

          UPDATE ${table}
          SET plot_id = plot_id - 1000
          WHERE plot_id >= 1000;
        `);
      }
    }
    if (version < 4) {
      for (const table of ["farm_state", "unlocked_plots"]) {
        db.exec(`
          UPDATE ${table}
          SET plot_id = 1000
            + CAST(plot_id / 8 AS INTEGER) * 10
            + CASE
                WHEN (plot_id % 8) < 4 THEN plot_id % 8
                ELSE (plot_id % 8) + 1
              END
          WHERE plot_id BETWEEN 0 AND 39;

          UPDATE ${table}
          SET plot_id = plot_id - 1000
          WHERE plot_id >= 1000;
        `);
      }
      db.exec(`
        INSERT OR IGNORE INTO unlocked_plots (player_id, plot_id)
        SELECT id, 4 FROM players WHERE is_initialized = 1;

        INSERT OR IGNORE INTO unlocked_plots (player_id, plot_id)
        SELECT id, 9 FROM players WHERE is_initialized = 1;
      `);
    }
    db.exec("PRAGMA user_version = 4");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
