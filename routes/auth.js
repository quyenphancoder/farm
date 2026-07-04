import { Router } from "express";
import { runTransaction } from "./transaction.js";
import { t } from "../i18n.js";

const router = Router();

router.get("/profile", (req, res) => {
  const player = req.app.locals.db
    .prepare("SELECT name FROM players WHERE id = 1")
    .get();

  const name = !player?.name || player.name === "Nông dân"
    ? t(req.language, "common.farmer")
    : player.name;
  res.json({ name });
});

router.post("/new-game", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 30);
  if (!name) {
    return res.status(400).json({ error: t(req.language, "auth.enterName") });
  }

  const db = req.app.locals.db;
  runTransaction(db, () => {
    db.prepare("DELETE FROM farm_state WHERE player_id = 1").run();
    db.prepare("DELETE FROM inventory WHERE player_id = 1").run();
    db.prepare("DELETE FROM unlocked_plots WHERE player_id = 1").run();
    db.prepare(`
      UPDATE players
      SET name = ?, coins = 500, diamonds = 200, level = 1, xp = 0,
          unlocked_rows = 1, water_started_at = NULL, created_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(name);

    for (let plotId = 0; plotId < 8; plotId += 1) {
      db.prepare(
        "INSERT INTO unlocked_plots (player_id, plot_id) VALUES (1, ?)"
      ).run(plotId);
    }
    db.prepare(
      "INSERT INTO inventory (player_id, item, quantity) VALUES (1, 'carrot_seed', 5)"
    ).run();
  });

  res.json({ ok: true, name });
});

export default router;
