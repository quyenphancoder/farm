import { Router } from "express";
import { runTransaction } from "./transaction.js";

const router = Router();

router.get("/", (req, res) => {
  res.send(`
    <section class="shop-panel">
      <h2 class="drawer-title">🏪 Tiệm Hạt Mầm</h2>
      <p class="drawer-subtitle">Chọn vật phẩm và số lượng muốn mua.</p>
      <div class="shop-grid">
        <button class="shop-product" type="button" data-name="Hạt cà rốt"
          data-price="2" onclick="selectShopItem(this)">
          <span class="product-icon">🌱</span>
          <strong>Hạt cà rốt</strong>
          <small>🪙 2 / hạt</small>
        </button>
        <button class="shop-product" type="button" disabled>
          <span class="product-lock">🔒</span>
          <span class="product-icon">🌽</span>
          <strong>Hạt ngô ngọt</strong>
          <small>Cấp 3</small>
        </button>
        <button class="shop-product" type="button" disabled>
          <span class="product-lock">🔒</span>
          <span class="product-icon">🍅</span>
          <strong>Hạt cà chua</strong>
          <small>Cấp 5</small>
        </button>
        <button class="shop-product" type="button" disabled>
          <span class="product-lock">🔒</span>
          <span class="product-icon">🍓</span>
          <strong>Hạt dâu tây</strong>
          <small>Cấp 8</small>
        </button>
      </div>

      <form id="shop-purchase" class="shop-purchase" data-unit-price="2" hidden
        hx-post="/api/shop/buy/carrot_seed" hx-target="#shop-result"
        hx-on::after-request="if(event.detail.successful) document.body.dispatchEvent(new CustomEvent('farm:changed'))"
        hx-on::response-error="document.getElementById('shop-result').innerHTML='<span class=&quot;shop-error&quot;>'+event.detail.xhr.responseText+'</span>'">
        <div class="purchase-summary">
          <strong id="selected-product-name">Hạt cà rốt</strong>
          <div class="quantity-picker">
            <button type="button" onclick="changeShopQuantity(-1)">−</button>
            <input id="shop-quantity" name="quantity" type="number" min="1" max="99"
              value="1" oninput="updateShopTotal()" />
            <button type="button" onclick="changeShopQuantity(1)">+</button>
          </div>
        </div>
        <div class="purchase-actions">
          <span>Tổng: <strong id="shop-total">2 xu</strong></span>
          <button class="buy-button" type="submit">Mua ngay</button>
        </div>
      </form>
      <div id="shop-result"></div>
    </section>
  `);
});

router.post("/buy/carrot_seed", (req, res) => {
  const db = req.app.locals.db;
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).send("Số lượng phải từ 1 đến 99.");
  }

  const totalPrice = quantity * 2;
  const player = db.prepare("SELECT coins FROM players WHERE id = 1").get();
  if (player.coins < totalPrice) {
    return res.status(400).send(`Bạn cần ${totalPrice} xu nhưng chỉ có ${player.coins} xu.`);
  }

  runTransaction(db, () => {
    db.prepare("UPDATE players SET coins = coins - ? WHERE id = 1").run(totalPrice);
    db.prepare(`
      INSERT INTO inventory (player_id, item, quantity) VALUES (1, 'carrot_seed', ?)
      ON CONFLICT(player_id, item) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(quantity);
  });
  res.send(`Đã mua ${quantity} hạt cà rốt với ${totalPrice} xu! 🌱`);
});

export default router;
