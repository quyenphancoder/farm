import { Router } from "express";
import { runTransaction } from "./transaction.js";
import { t } from "../i18n.js";

// Persistent shop routes.
const router = Router();

router.get("/", (req, res) => {
  const text = (key, values) => t(req.language, key, values);
  const playerLevel = req.app.locals.db
    .prepare("SELECT level FROM players WHERE id = current_player_id()")
    .get().level;
  const cornProduct = playerLevel >= 2
    ? `
        <button class="shop-product" type="button" data-name="${text("item.cornSeed")}"
          data-item="corn_seed" data-price="4" onclick="selectShopItem(this)">
          <span class="product-icon">🌽</span>
          <strong>${text("item.cornSeed")}</strong>
          <small>${text("shop.perCornSeed")}</small>
        </button>
      `
    : `
        <button class="shop-product" type="button" disabled>
          <span class="product-lock">🔒</span>
          <span class="product-icon">🌽</span>
          <strong>${text("item.cornSeed")}</strong>
          <small>${text("shop.level", { level: 2 })}</small>
        </button>
      `;
  res.send(`
    <section class="shop-panel">
      <h2 class="drawer-title">${text("shop.title")}</h2>
      <p class="drawer-subtitle">${text("shop.subtitle")}</p>
      <div class="shop-grid">
        <button class="shop-product" type="button" data-name="${text("item.carrotSeed")}"
          data-item="carrot_seed" data-price="2" onclick="selectShopItem(this)">
          <span class="product-icon">🌱</span>
          <strong>${text("item.carrotSeed")}</strong>
          <small>${text("shop.perSeed")}</small>
        </button>
        <button class="shop-product" type="button" data-name="${text("item.pesticide")}"
          data-item="pesticide" data-price="5" onclick="selectShopItem(this)">
          <span class="product-icon">🧴</span>
          <strong>${text("item.pesticide")}</strong>
          <small>${text("shop.perBottle")}</small>
        </button>
        <button class="shop-product" type="button" data-name="${text("item.chicken")}"
          data-item="chicken" data-price="120" onclick="selectShopItem(this)">
          <span class="product-icon">🐔</span>
          <strong>${text("item.chicken")}</strong>
          <small>${text("shop.perChicken")}</small>
        </button>
        <button class="shop-product" type="button" data-name="${text("item.duck")}"
          data-item="duck" data-price="140" onclick="selectShopItem(this)">
          <span class="product-icon">🦆</span>
          <strong>${text("item.duck")}</strong>
          <small>${text("shop.perDuck")}</small>
        </button>
        ${cornProduct}
        <button class="shop-product" type="button" disabled>
          <span class="product-lock">🔒</span>
          <span class="product-icon">🍅</span>
          <strong>${text("item.tomatoSeed")}</strong>
          <small>${text("shop.level", { level: 5 })}</small>
        </button>
      </div>

      <form id="shop-purchase" class="shop-purchase" data-unit-price="2" hidden
        hx-post="/api/shop/buy" hx-target="#shop-result"
        hx-on::after-request="if(event.detail.successful) document.body.dispatchEvent(new CustomEvent('farm:changed'))"
        hx-on::response-error="document.getElementById('shop-result').innerHTML='<span class=&quot;shop-error&quot;>'+event.detail.xhr.responseText+'</span>'">
        <input id="shop-item" name="item" type="hidden" value="carrot_seed" />
        <div class="purchase-summary">
          <strong id="selected-product-name">${text("item.carrotSeed")}</strong>
          <div class="quantity-picker">
            <button type="button" onclick="changeShopQuantity(-1)">−</button>
            <input id="shop-quantity" name="quantity" type="number" min="1" max="99"
              value="1" oninput="updateShopTotal()" />
            <button type="button" onclick="changeShopQuantity(1)">+</button>
          </div>
        </div>
        <div class="purchase-actions">
          <span>${text("shop.total")} <strong id="shop-total">${text("shop.coins", { amount: 2 })}</strong></span>
          <button class="buy-button" type="submit">${text("shop.buyNow")}</button>
        </div>
      </form>
      <div id="shop-result"></div>
    </section>
  `);
});

router.post("/buy", (req, res) => {
  const db = req.app.locals.db;
  const quantity = Number(req.body.quantity);
  const item = String(req.body.item || "");
  const products = {
    carrot_seed: { price: 2, name: t(req.language, "item.carrotSeed"), unlockLevel: 1 },
    corn_seed: { price: 4, name: t(req.language, "item.cornSeed"), unlockLevel: 2 },
    pesticide: { price: 5, name: t(req.language, "item.pesticide"), unlockLevel: 1 },
    chicken: { price: 120, name: t(req.language, "item.chicken"), unlockLevel: 1 },
    duck: { price: 140, name: t(req.language, "item.duck"), unlockLevel: 1 }
  };
  const product = products[item];

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).send(t(req.language, "shop.invalidQuantity"));
  }
  if (!product) {
    return res.status(400).send(t(req.language, "shop.invalidItem"));
  }

  const totalPrice = quantity * product.price;
  const player = db.prepare("SELECT coins, level FROM players WHERE id = current_player_id()").get();
  if (player.level < product.unlockLevel) {
    return res.status(403).send(t(req.language, "shop.levelRequired", {
      level: product.unlockLevel
    }));
  }
  if (player.coins < totalPrice) {
    return res.status(400).send(t(req.language, "shop.notEnoughCoins", {
      needed: totalPrice,
      available: player.coins
    }));
  }

  runTransaction(db, () => {
    db.prepare("UPDATE players SET coins = coins - ? WHERE id = current_player_id()").run(totalPrice);
    db.prepare(`
      INSERT INTO inventory (player_id, item, quantity) VALUES (current_player_id(), ?, ?)
      ON CONFLICT(player_id, item) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(item, quantity);
  });
  res.send(t(req.language, "shop.purchaseSuccess", {
    quantity,
    item: product.name,
    price: totalPrice
  }));
});

export default router;
