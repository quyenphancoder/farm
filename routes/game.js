import { Router } from "express";
import { runTransaction } from "./transaction.js";
import { t } from "../i18n.js";

const router = Router();
const LAND_UNLOCK_COST = 50;
const TOTAL_PLOTS = 40;
const CROP_GROWTH_MS = 10000;
const WATER_COLLECTION_MS = 10000;
const HARVEST_XP = 10;
const XP_PER_LEVEL = 100;
const SELL_PRICES = {
  carrot: 8,
  corn: 12
};

router.get("/state", (req, res) => {
  const db = req.app.locals.db;
  const player = db.prepare("SELECT * FROM players WHERE id = 1").get();
  const inventory = db.prepare("SELECT item, quantity FROM inventory WHERE player_id = 1").all();
  const plots = db.prepare(`
    SELECT plot_id, crop, planted_at, watered_at, treated_at
    FROM farm_state
    WHERE player_id = 1 AND plot_id < ?
  `).all(TOTAL_PLOTS);
  const unlockedPlots = db.prepare(`
    SELECT plot_id
    FROM unlocked_plots
    WHERE player_id = 1 AND plot_id < ?
  `).all(TOTAL_PLOTS)
    .map((plot) => plot.plot_id);
  res.json({ player, inventory, plots, unlockedPlots, serverTime: Date.now() });
});

router.post("/plots/:plotId/plant", (req, res) => {
  const db = req.app.locals.db;
  const plotId = Number(req.params.plotId);
  const seedItem = String(req.body.seed || "carrot_seed");
  const seedMeta = {
    carrot_seed: { crop: "carrot", unlockLevel: 1 },
    corn_seed: { crop: "corn", unlockLevel: 2 }
  };
  const selectedSeed = seedMeta[seedItem];

  if (!selectedSeed) {
    return res.status(400).json({ error: t(req.language, "plot.invalidSeed") });
  }

  const player = db.prepare("SELECT level FROM players WHERE id = 1").get();
  if (player.level < selectedSeed.unlockLevel) {
    return res.status(403).json({
      error: t(req.language, "plot.levelRequired", { level: selectedSeed.unlockLevel })
    });
  }

  const seed = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = ?"
  ).get(seedItem);

  if (!Number.isInteger(plotId) || plotId < 0 || plotId >= TOTAL_PLOTS) {
    return res.status(400).json({ error: t(req.language, "plot.invalid") });
  }
  if (!isPlotUnlocked(db, plotId)) {
    return res.status(403).json({ error: t(req.language, "plot.locked") });
  }
  if (!seed || seed.quantity < 1) {
    return res.status(400).json({ error: t(req.language, "plot.noSeeds") });
  }

  const plantedAt = Date.now();
  try {
    runTransaction(db, () => {
      const result = db.prepare(`
        INSERT INTO farm_state (player_id, plot_id, crop, planted_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(player_id, plot_id) DO NOTHING
      `).run(plotId, selectedSeed.crop, plantedAt);
      if (!result.changes) throw new Error(t(req.language, "plot.planted"));
      db.prepare(
        "UPDATE inventory SET quantity = quantity - 1 WHERE player_id = 1 AND item = ?"
      ).run(seedItem);
    });
    res.json({ ok: true, crop: selectedSeed.crop, plantedAt });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

router.post("/plots/:plotId/harvest", (req, res) => {
  const db = req.app.locals.db;
  const plotId = Number(req.params.plotId);
  const plot = db.prepare(
    "SELECT * FROM farm_state WHERE player_id = 1 AND plot_id = ?"
  ).get(plotId);

  if (!plot) return res.status(404).json({ error: t(req.language, "plot.empty") });
  if (!isPlotUnlocked(db, plotId)) {
    return res.status(403).json({ error: t(req.language, "plot.locked") });
  }
  if (!plot.treated_at || Date.now() - plot.treated_at < CROP_GROWTH_MS) {
    return res.status(400).json({ error: t(req.language, "plot.notReady") });
  }

  const player = db.prepare("SELECT level, xp FROM players WHERE id = 1").get();
  const totalXp = player.xp + HARVEST_XP;
  const levelsGained = Math.floor(totalXp / XP_PER_LEVEL);
  const level = player.level + levelsGained;
  const xp = totalXp % XP_PER_LEVEL;
  runTransaction(db, () => {
    db.prepare("DELETE FROM farm_state WHERE player_id = 1 AND plot_id = ?").run(plotId);
    db.prepare(`
      INSERT INTO inventory (player_id, item, quantity) VALUES (1, ?, 1)
      ON CONFLICT(player_id, item) DO UPDATE SET quantity = quantity + 1
    `).run(plot.crop);
    db.prepare("UPDATE players SET level = ?, xp = ? WHERE id = 1").run(level, xp);
  });
  res.json({
    ok: true,
    item: plot.crop,
    quantity: 1,
    xpGained: HARVEST_XP,
    xp,
    level,
    leveledUp: levelsGained > 0
  });
});

router.post("/plots/:plotId/water", (req, res) => {
  const db = req.app.locals.db;
  const plotId = Number(req.params.plotId);
  const plot = db.prepare(
    "SELECT * FROM farm_state WHERE player_id = 1 AND plot_id = ?"
  ).get(plotId);

  if (!plot) return res.status(404).json({ error: t(req.language, "plot.empty") });
  if (!isPlotUnlocked(db, plotId)) {
    return res.status(403).json({ error: t(req.language, "plot.locked") });
  }
  if (Date.now() - plot.planted_at < CROP_GROWTH_MS) {
    return res.status(400).json({ error: t(req.language, "plot.notReadyForWater") });
  }
  if (plot.watered_at) {
    return res.status(400).json({ error: t(req.language, "plot.alreadyWatered") });
  }

  const water = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = 'water'"
  ).get();
  if (!water || water.quantity < 1) {
    return res.status(400).json({ error: t(req.language, "plot.noWater") });
  }

  const wateredAt = Date.now();
  runTransaction(db, () => {
    db.prepare(`
      UPDATE farm_state
      SET watered_at = ?
      WHERE player_id = 1 AND plot_id = ? AND watered_at IS NULL
    `).run(wateredAt, plotId);
    db.prepare(`
      UPDATE inventory
      SET quantity = quantity - 1
      WHERE player_id = 1 AND item = 'water'
    `).run();
  });

  res.json({ ok: true, wateredAt });
});

router.post("/plots/:plotId/pesticide", (req, res) => {
  const db = req.app.locals.db;
  const plotId = Number(req.params.plotId);
  const plot = db.prepare(
    "SELECT * FROM farm_state WHERE player_id = 1 AND plot_id = ?"
  ).get(plotId);

  if (!plot) return res.status(404).json({ error: t(req.language, "plot.empty") });
  if (!isPlotUnlocked(db, plotId)) {
    return res.status(403).json({ error: t(req.language, "plot.locked") });
  }
  if (!plot.watered_at) {
    return res.status(400).json({ error: t(req.language, "plot.needsWaterFirst") });
  }
  if (Date.now() - plot.watered_at < CROP_GROWTH_MS) {
    return res.status(400).json({ error: t(req.language, "plot.notReadyForPesticide") });
  }
  if (plot.treated_at) {
    return res.status(400).json({ error: t(req.language, "plot.alreadyTreated") });
  }

  const pesticide = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = 'pesticide'"
  ).get();
  if (!pesticide || pesticide.quantity < 1) {
    return res.status(400).json({ error: t(req.language, "plot.noPesticide") });
  }

  const treatedAt = Date.now();
  runTransaction(db, () => {
    db.prepare(`
      UPDATE farm_state
      SET treated_at = ?
      WHERE player_id = 1 AND plot_id = ? AND treated_at IS NULL
    `).run(treatedAt, plotId);
    db.prepare(`
      UPDATE inventory
      SET quantity = quantity - 1
      WHERE player_id = 1 AND item = 'pesticide'
    `).run();
  });

  res.json({ ok: true, treatedAt });
});

router.post("/well/collect", (req, res) => {
  const db = req.app.locals.db;
  const player = db.prepare(
    "SELECT water_started_at FROM players WHERE id = 1"
  ).get();
  const now = Date.now();

  if (!player?.water_started_at) {
    db.prepare("UPDATE players SET water_started_at = ? WHERE id = 1").run(now);
    return res.json({
      ok: true,
      collecting: true,
      readyAt: now + WATER_COLLECTION_MS
    });
  }

  const readyAt = player.water_started_at + WATER_COLLECTION_MS;
  if (now < readyAt) {
    return res.json({ ok: true, collecting: true, readyAt });
  }

  runTransaction(db, () => {
    db.prepare("UPDATE players SET water_started_at = NULL WHERE id = 1").run();
    db.prepare(`
      INSERT INTO inventory (player_id, item, quantity) VALUES (1, 'water', 1)
      ON CONFLICT(player_id, item) DO UPDATE SET quantity = quantity + 1
    `).run();
  });
  const quantity = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = 'water'"
  ).get().quantity;

  res.json({ ok: true, collected: true, item: "water", quantity });
});

router.post("/land/unlock", (req, res) => {
  const db = req.app.locals.db;
  const plotId = Number(req.body.plotId);
  const player = db.prepare("SELECT diamonds FROM players WHERE id = 1").get();

  if (!Number.isInteger(plotId) || plotId < 0 || plotId >= TOTAL_PLOTS) {
    return res.status(400).json({ error: t(req.language, "plot.invalid") });
  }
  if (isPlotUnlocked(db, plotId)) {
    return res.status(400).json({ error: t(req.language, "plot.alreadyBought") });
  }
  if (player.diamonds < LAND_UNLOCK_COST) {
    return res.status(400).json({
      error: t(req.language, "plot.needDiamonds", { cost: LAND_UNLOCK_COST })
    });
  }

  runTransaction(db, () => {
    db.prepare(`
      UPDATE players
      SET diamonds = diamonds - ?
      WHERE id = 1
    `).run(LAND_UNLOCK_COST);
    db.prepare("INSERT INTO unlocked_plots (player_id, plot_id) VALUES (1, ?)").run(plotId);
  });

  const updated = db.prepare("SELECT diamonds FROM players WHERE id = 1").get();
  res.json({ ok: true, diamonds: updated.diamonds, plotId });
});

router.get("/hud", (req, res) => {
  const db = req.app.locals.db;
  const player = db.prepare("SELECT coins, diamonds FROM players WHERE id = 1").get();

  res.send(`
    <span class="resource-pill">
      <span class="resource-icon">🪙</span><strong>${player.coins.toLocaleString(req.language === "en" ? "en-US" : "vi-VN")}</strong><em>+</em>
    </span>
    <span class="resource-pill">
      <span class="resource-icon">💎</span><strong>${player.diamonds.toLocaleString(req.language === "en" ? "en-US" : "vi-VN")}</strong><em>+</em>
    </span>
  `);
});

router.get("/inventory", (req, res) => {
  const db = req.app.locals.db;
  const items = db.prepare(
    "SELECT item, quantity FROM inventory WHERE player_id = 1 AND quantity > 0 ORDER BY item"
  ).all();
  const meta = {
    carrot_seed: { name: t(req.language, "item.carrotSeed"), icon: "🌱" },
    corn_seed: { name: t(req.language, "item.cornSeed"), icon: "🌽" },
    carrot: { name: t(req.language, "item.carrot"), icon: "🥕", sellPrice: SELL_PRICES.carrot },
    corn: { name: t(req.language, "item.corn"), icon: "🌽", sellPrice: SELL_PRICES.corn },
    water: { name: t(req.language, "item.water"), icon: "💧" },
    pesticide: { name: t(req.language, "item.pesticide"), icon: "🧴" }
  };
  const occupiedSlots = items.map((item) => {
    const info = meta[item.item] || { name: item.item, icon: "📦" };
    if (info.sellPrice) {
      return `
        <button class="inventory-slot filled sellable" type="button"
          title="${t(req.language, "inventory.sellHint")}"
          data-item="${item.item}" data-name="${info.name}"
          data-price="${info.sellPrice}" data-quantity="${item.quantity}"
          onclick="selectInventoryProduce(this)">
          <span class="slot-icon">${info.icon}</span>
          <small class="slot-name">${info.name}</small>
          <b class="slot-quantity">${item.quantity}</b>
        </button>
      `;
    }
    return `
      <div class="inventory-slot filled" title="${info.name}">
        <span class="slot-icon">${info.icon}</span>
        <small class="slot-name">${info.name}</small>
        <b class="slot-quantity">${item.quantity}</b>
      </div>
    `;
  });
  const totalSlots = Math.max(12, Math.ceil(occupiedSlots.length / 4) * 4);
  const emptySlots = Array.from(
    { length: totalSlots - occupiedSlots.length },
    () => `<div class="inventory-slot empty" aria-label="${t(req.language, "inventory.empty")}"></div>`
  );

  res.send(`
    <section class="inventory-panel" hx-get="/api/game/inventory"
      hx-trigger="farm:changed from:body delay:500ms" hx-target="this" hx-swap="outerHTML">
      <h2 class="drawer-title">${t(req.language, "inventory.title")}</h2>
      <p class="drawer-subtitle">${t(req.language, "inventory.usage", { used: items.length, total: totalSlots })}</p>
      <div class="inventory-grid">${occupiedSlots.join("")}${emptySlots.join("")}</div>
      <form id="inventory-sale" class="shop-purchase inventory-sale" hidden
        data-unit-price="0" data-max-quantity="1"
        hx-post="/api/game/sell" hx-target="#inventory-sale-result"
        hx-on::after-request="if(event.detail.successful) document.body.dispatchEvent(new CustomEvent('farm:changed'))"
        hx-on::response-error="document.getElementById('inventory-sale-result').innerHTML='<span class=&quot;shop-error&quot;>'+event.detail.xhr.responseText+'</span>'">
        <input id="inventory-sale-item" name="item" type="hidden" />
        <div class="purchase-summary">
          <strong id="inventory-sale-name"></strong>
          <div class="quantity-picker">
            <button type="button" onclick="changeInventorySaleQuantity(-1)">−</button>
            <input id="inventory-sale-quantity" name="quantity" type="number"
              min="1" max="1" value="1" oninput="updateInventorySaleTotal()" />
            <button type="button" onclick="changeInventorySaleQuantity(1)">+</button>
          </div>
        </div>
        <div class="purchase-actions">
          <span>${t(req.language, "inventory.total")} <strong id="inventory-sale-total"></strong></span>
          <button class="buy-button" type="submit">${t(req.language, "inventory.sell")}</button>
        </div>
      </form>
      <div id="inventory-sale-result"></div>
    </section>
  `);
});

router.post("/sell", (req, res) => {
  const db = req.app.locals.db;
  const item = String(req.body.item || "");
  const quantity = Number(req.body.quantity);
  const price = SELL_PRICES[item];
  const names = {
    carrot: t(req.language, "item.carrot"),
    corn: t(req.language, "item.corn")
  };

  if (!price) {
    return res.status(400).send(t(req.language, "inventory.invalidItem"));
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).send(t(req.language, "inventory.invalidQuantity"));
  }

  const stock = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = ?"
  ).get(item)?.quantity ?? 0;
  if (stock < quantity) {
    return res.status(400).send(t(req.language, "inventory.notEnough", { available: stock }));
  }

  const earned = quantity * price;
  runTransaction(db, () => {
    db.prepare(`
      UPDATE inventory
      SET quantity = quantity - ?
      WHERE player_id = 1 AND item = ?
    `).run(quantity, item);
    db.prepare("UPDATE players SET coins = coins + ? WHERE id = 1").run(earned);
  });

  res.send(t(req.language, "inventory.sold", {
    quantity,
    item: names[item],
    earned
  }));
});

router.get("/quests", (req, res) => {
  const db = req.app.locals.db;
  const carrots = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = 'carrot'"
  ).get()?.quantity ?? 0;
  const planted = db.prepare(
    "SELECT COUNT(*) AS count FROM farm_state WHERE player_id = 1"
  ).get().count;
  const carrotProgress = Math.min(carrots, 3);
  const plantProgress = Math.min(planted, 5);

  res.send(`
    <div class="quest-popup-content" hx-get="/api/game/quests"
      hx-trigger="farm:changed from:body" hx-target="this" hx-swap="outerHTML">
      <h2 class="drawer-title">${t(req.language, "quests.title")}</h2>
      <p class="drawer-subtitle">${t(req.language, "quests.subtitle")}</p>
      <div class="quest-list-popup">
        <div class="quest-row">
          <span class="quest-icon">🥕</span>
          <div>
            <strong>${t(req.language, "quests.harvestCarrots")}</strong>
            <div class="quest-progress"><i style="width:${carrotProgress / 3 * 100}%"></i></div>
            <small>${carrotProgress}/3 · <span class="quest-reward">🪙 30</span></small>
          </div>
        </div>
        <div class="quest-row">
          <span class="quest-icon">🌱</span>
          <div>
            <strong>${t(req.language, "quests.plantSeeds")}</strong>
            <div class="quest-progress"><i style="width:${plantProgress / 5 * 100}%"></i></div>
            <small>${plantProgress}/5 · <span class="quest-reward">⭐ 20 XP</span></small>
          </div>
        </div>
        <div class="quest-row">
          <span class="quest-icon">🧺</span>
          <div>
            <strong>${t(req.language, "quests.collectProduce")}</strong>
            <div class="quest-progress"><i style="width:${Math.min(carrots, 5) / 5 * 100}%"></i></div>
            <small>${Math.min(carrots, 5)}/5 · <span class="quest-reward">💎 5</span></small>
          </div>
        </div>
      </div>
    </div>
  `);
});

router.get("/events", (req, res) => {
  res.send(`
    <div>
      <h2 class="drawer-title">${t(req.language, "events.title")}</h2>
      <p class="drawer-subtitle">${t(req.language, "events.subtitle")}</p>
      <div class="shop-item">
        <span class="item-art">🌻</span>
        <span class="item-copy">
          <strong>${t(req.language, "events.sunflowerFestival")}</strong>
          <small>${t(req.language, "events.unlockLevel3")}</small>
        </span>
        <b>🔒</b>
      </div>
    </div>
  `);
});

router.get("/map", (req, res) => {
  res.send(`
    <div>
      <h2 class="drawer-title">${t(req.language, "map.title")}</h2>
      <p class="drawer-subtitle">${t(req.language, "map.subtitle")}</p>
      <div class="shop-item">
        <span class="item-art">🏡</span>
        <span class="item-copy">
          <strong>${t(req.language, "map.sunnyFarm")}</strong>
          <small>${t(req.language, "map.currentLocation")}</small>
        </span>
        <b>✓</b>
      </div>
      <div class="shop-item">
        <span class="item-art">🏘️</span>
        <span class="item-copy">
          <strong>${t(req.language, "map.greenleafTown")}</strong>
          <small>${t(req.language, "map.unlockLevel5")}</small>
        </span>
        <b>🔒</b>
      </div>
    </div>
  `);
});

export default router;

function isPlotUnlocked(db, plotId) {
  return Boolean(db.prepare(
    "SELECT 1 FROM unlocked_plots WHERE player_id = 1 AND plot_id = ?"
  ).get(plotId));
}
