import { Router } from "express";
import { runTransaction } from "./transaction.js";

const router = Router();

router.get("/state", (req, res) => {
  const db = req.app.locals.db;
  const player = db.prepare("SELECT * FROM players WHERE id = 1").get();
  const inventory = db.prepare("SELECT item, quantity FROM inventory WHERE player_id = 1").all();
  const plots = db.prepare("SELECT plot_id, crop, planted_at FROM farm_state WHERE player_id = 1").all();
  res.json({ player, inventory, plots, serverTime: Date.now() });
});

router.post("/plots/:plotId/plant", (req, res) => {
  const db = req.app.locals.db;
  const plotId = Number(req.params.plotId);
  const seed = db.prepare(
    "SELECT quantity FROM inventory WHERE player_id = 1 AND item = 'carrot_seed'"
  ).get();

  if (!Number.isInteger(plotId) || plotId < 0 || plotId > 11) {
    return res.status(400).json({ error: "Ô đất không hợp lệ." });
  }
  if (!seed || seed.quantity < 1) {
    return res.status(400).json({ error: "Bạn đã hết hạt giống." });
  }

  const plantedAt = Date.now();
  try {
    runTransaction(db, () => {
      const result = db.prepare(`
        INSERT INTO farm_state (player_id, plot_id, crop, planted_at)
        VALUES (1, ?, 'carrot', ?)
        ON CONFLICT(player_id, plot_id) DO NOTHING
      `).run(plotId, plantedAt);
      if (!result.changes) throw new Error("Ô đất này đã được trồng.");
      db.prepare(
        "UPDATE inventory SET quantity = quantity - 1 WHERE player_id = 1 AND item = 'carrot_seed'"
      ).run();
    });
    res.json({ ok: true, crop: "carrot", plantedAt });
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

  if (!plot) return res.status(404).json({ error: "Ô đất đang trống." });
  if (Date.now() - plot.planted_at < 10000) {
    return res.status(400).json({ error: "Cây chưa trưởng thành." });
  }

  runTransaction(db, () => {
    db.prepare("DELETE FROM farm_state WHERE player_id = 1 AND plot_id = ?").run(plotId);
    db.prepare(`
      INSERT INTO inventory (player_id, item, quantity) VALUES (1, 'carrot', 1)
      ON CONFLICT(player_id, item) DO UPDATE SET quantity = quantity + 1
    `).run();
  });
  res.json({ ok: true, item: "carrot", quantity: 1 });
});

router.get("/hud", (req, res) => {
  const db = req.app.locals.db;
  const player = db.prepare("SELECT coins FROM players WHERE id = 1").get();

  res.send(`
    <span class="resource-pill">
      <span class="resource-icon">🪙</span><strong>${player.coins.toLocaleString("vi-VN")}</strong><em>+</em>
    </span>
    <span class="resource-pill">
      <span class="resource-icon">💎</span><strong>320</strong><em>+</em>
    </span>
  `);
});

router.get("/inventory", (req, res) => {
  const db = req.app.locals.db;
  const items = db.prepare(
    "SELECT item, quantity FROM inventory WHERE player_id = 1 AND quantity > 0 ORDER BY item"
  ).all();
  const meta = {
    carrot_seed: { name: "Hạt cà rốt", icon: "🌱", description: "Sẵn sàng để gieo trồng" },
    carrot: { name: "Cà rốt", icon: "🥕", description: "Nông sản tươi ngon" }
  };
  const occupiedSlots = items.map((item) => {
    const info = meta[item.item] || { name: item.item, icon: "📦" };
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
    () => `<div class="inventory-slot empty" aria-label="Ô trống"></div>`
  );

  res.send(`
    <h2 class="drawer-title">🎒 Kho đồ</h2>
    <p class="drawer-subtitle">${items.length}/${totalSlots} ô đang được sử dụng.</p>
    <div class="inventory-grid">${occupiedSlots.join("")}${emptySlots.join("")}</div>
  `);
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
      <h2 class="drawer-title">📜 Nhiệm vụ hôm nay</h2>
      <p class="drawer-subtitle">Hoàn thành mục tiêu để nhận thêm xu và kinh nghiệm.</p>
      <div class="quest-list-popup">
        <div class="quest-row">
          <span class="quest-icon">🥕</span>
          <div>
            <strong>Thu hoạch 3 củ cà rốt</strong>
            <div class="quest-progress"><i style="width:${carrotProgress / 3 * 100}%"></i></div>
            <small>${carrotProgress}/3 · <span class="quest-reward">🪙 30</span></small>
          </div>
        </div>
        <div class="quest-row">
          <span class="quest-icon">🌱</span>
          <div>
            <strong>Gieo 5 hạt giống</strong>
            <div class="quest-progress"><i style="width:${plantProgress / 5 * 100}%"></i></div>
            <small>${plantProgress}/5 · <span class="quest-reward">⭐ 20 XP</span></small>
          </div>
        </div>
        <div class="quest-row">
          <span class="quest-icon">🧺</span>
          <div>
            <strong>Thu thập 5 nông sản</strong>
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
      <h2 class="drawer-title">🎁 Sự kiện mùa hè</h2>
      <p class="drawer-subtitle">Các hoạt động giới hạn sẽ xuất hiện tại đây.</p>
      <div class="shop-item">
        <span class="item-art">🌻</span>
        <span class="item-copy">
          <strong>Lễ hội Hoa Nắng</strong>
          <small>Mở khóa khi đạt cấp 3</small>
        </span>
        <b>🔒</b>
      </div>
    </div>
  `);
});

router.get("/map", (req, res) => {
  res.send(`
    <div>
      <h2 class="drawer-title">🗺️ Bản đồ thung lũng</h2>
      <p class="drawer-subtitle">Khám phá thêm địa điểm khi nông trại lên cấp.</p>
      <div class="shop-item">
        <span class="item-art">🏡</span>
        <span class="item-copy">
          <strong>Nông trại Sunny</strong>
          <small>Vị trí hiện tại của bạn</small>
        </span>
        <b>✓</b>
      </div>
      <div class="shop-item">
        <span class="item-art">🏘️</span>
        <span class="item-copy">
          <strong>Thị trấn Lá Xanh</strong>
          <small>Mở khóa ở cấp 5</small>
        </span>
        <b>🔒</b>
      </div>
    </div>
  `);
});

export default router;
