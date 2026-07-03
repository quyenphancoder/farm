import express from "express";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
import shopRoutes from "./routes/shop.js";
import adminRoutes from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const db = new DatabaseSync(path.join(__dirname, "database.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Nông dân',
    coins INTEGER NOT NULL DEFAULT 100,
    level INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

db.prepare("INSERT OR IGNORE INTO players (id, name, coins) VALUES (1, 'Nông dân', 100)").run();
ensurePlayerColumn(db, "diamonds", "INTEGER NOT NULL DEFAULT 320");
ensurePlayerColumn(db, "unlocked_rows", "INTEGER NOT NULL DEFAULT 1");
for (let plotId = 0; plotId < 5; plotId += 1) {
  db.prepare("INSERT OR IGNORE INTO unlocked_plots (player_id, plot_id) VALUES (1, ?)").run(plotId);
}
db.prepare("INSERT OR IGNORE INTO inventory (player_id, item, quantity) VALUES (1, 'carrot_seed', 5)").run();

app.locals.db = db;
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/admin", adminRoutes);

app.listen(port, () => {
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
