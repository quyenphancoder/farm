import Player from "../systems/player.js";
import CropSystem from "../systems/cropSystem.js";
import InventorySystem from "../systems/inventorySystem.js";
import AnimalRig from "../systems/animalRig.js";

const CURSOR_DEFAULT = 'url("/assets/ui/cursor-farm.svg") 5 4, auto';
const CURSOR_POINTER = 'url("/assets/ui/cursor-farm-pointer.svg") 12 5, pointer';

// === TỌA ĐỘ FARM CÓ THỂ CHỈNH TẠI ĐÂY ===
// Mở game với ?debugMap=1 để hiện khung, editor và tên các vị trí bên dưới.
const DEFAULT_FARM_LAYOUT = {
  playerSpawn: { x: 270, y: 205 },
  shop: { x: 270, y: 151, width: 58, height: 72, entranceX: 270, entranceY: 205 },
  storage: { x: 850, y: 155, width: 80, height: 60, entranceX: 850, entranceY: 210 },
  well: { x: 993, y: 175, zoneOffsetY: -6, width: 56, height: 42 },
  farmGate: { x: 543, y: 535, width: 100, height: 65, entranceX: 540, entranceY: 500 },
  plots: {
    "plotWidth": 50,
    "plotHeight": 40,
    "plotSpacingX": 60,
    "plotSpacingY": 44,
    "patchGapX": 80,
    "leftPatchOffsetX": -40,
    "rightPatchOffsetX": 45,
    "gridCenterX": 486,
    "gridStartY": 273
  }
};
const FARM_LAYOUT_STORAGE_KEY = "sunnyfarmFarmLayout";

function loadFarmLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(FARM_LAYOUT_STORAGE_KEY));
    if (!saved || typeof saved !== "object") return structuredClone(DEFAULT_FARM_LAYOUT);
    return Object.fromEntries(Object.entries(DEFAULT_FARM_LAYOUT).map(([key, defaults]) => [
      key,
      { ...defaults, ...(saved[key] || {}) }
    ]));
  } catch {
    return structuredClone(DEFAULT_FARM_LAYOUT);
  }
}

const FARM_LAYOUT = loadFarmLayout();

export default class FarmScene extends Phaser.Scene {
  constructor() {
    super("FarmScene");
  }

  async create() {
    const inputEnabled = window.gameInputEnabled !== false;
    this.input.enabled = inputEnabled;
    if (this.input.keyboard) this.input.keyboard.enabled = inputEnabled;
    this.input.setDefaultCursor(CURSOR_DEFAULT);

    this.baseMapWidth = 1067;
    this.baseMapHeight = 600;
    this.mapScale = 1;
    this.mapWidth = Math.round(this.baseMapWidth * this.mapScale);
    this.mapHeight = Math.round(this.baseMapHeight * this.mapScale);
    this.mapOffsetX = this.mapWidth / 2 - 480;
    this.mapOffsetY = this.mapHeight / 2 - 300;
    this.currentMap = "farm";
    this.farmOnlyObjects = [];
    this.seaOnlyObjects = [];
    this.chickens = [];
    this.ducks = [];
    this.chickenRoamAreas = [
      { x: 168, y: 245, width: 170, height: 230 },
      { x: 358, y: 360, width: 300, height: 135 },
      { x: 690, y: 250, width: 245, height: 240 }
    ];
    this.mapConfigs = {
      farm: {
        bounds: {
          x: 0,
          y: 0,
          width: this.mapWidth,
          height: this.mapHeight
        },
        spawnFromSea: { x: FARM_LAYOUT.farmGate.x * this.mapScale, y: 485 * this.mapScale }
      },
      sea: {
        bounds: {
          x: 0,
          y: 0,
          width: this.mapWidth,
          height: this.mapHeight
        },
        spawnFromFarm: { x: 535 * this.mapScale, y: 82 * this.mapScale }
      }
    };

    this.backgrounds = {
      farm: this.add.image(this.mapWidth / 2, this.mapHeight / 2, "farm-background")
        .setDisplaySize(this.mapWidth, this.mapHeight),
      sea: this.add.image(this.mapWidth / 2, this.mapHeight / 2, "sea-background")
        .setDisplaySize(this.mapWidth, this.mapHeight)
        .setVisible(false)
    };
    this.background = this.backgrounds.farm;
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.resizeView();
    this.scale.on("resize", () => this.resizeView());
    this.applyMapBounds("farm");

    this.inventory = new InventorySystem();
    this.farmLayout = FARM_LAYOUT;
    this.crops = new CropSystem(this, this.inventory);
    this.player = new Player(
      this,
      FARM_LAYOUT.playerSpawn.x * this.mapScale,
      FARM_LAYOUT.playerSpawn.y * this.mapScale
    );
    this.createBuildingInteractions();
    this.createWellInteraction();
    this.createMapGateInteractions();
    this.createFarmEventDebug();
    this.createFarmCollisions();
    this.createSeaCollisions();
    this.createMapCollisionDebug();
    this.farmChangedHandler = () => this.syncChickensFromServer();
    document.body.addEventListener("farm:changed", this.farmChangedHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.removeEventListener("farm:changed", this.farmChangedHandler);
      this.clearChickens();
      this.clearDucks();
      this.farmLayoutEditor?.remove();
      this.farmLayoutToggle?.remove();
    });
    this.cameras.main.startFollow(this.player.sprite, true, .2, .2);

    try {
      const state = await this.crops.load();
      if (!this.crops.battleMode) {
        this.restoreWellCollection(state.player?.water_started_at);
      }
      this.syncChickensFromState(state);
      this.updateMapVisibility();
    } catch {
      this.crops.toast(window.i18n?.t("game.loadFailed") || "Unable to load farm data.");
    }
    document.body.dispatchEvent(new CustomEvent("game:scene-ready"));
  }

  createBuildingInteractions() {
    const buildings = [
      {
        key: "shop",
        ...FARM_LAYOUT.shop,
        open: () => window.openShop?.()
      },
      {
        key: "storage",
        ...FARM_LAYOUT.storage,
        open: () => window.openInventory?.()
      }
    ];

    this.buildingInteractions = [];
    buildings.forEach((building) => {
      const hitArea = this.add.zone(
        building.x * this.mapScale,
        building.y * this.mapScale,
        building.width * this.mapScale,
        building.height * this.mapScale
      )
        .setDepth(2);
      this.setGameInteractive(hitArea);
      this.farmOnlyObjects.push(hitArea);
      this.buildingInteractions.push({ building, hitArea });

      hitArea.on("pointerdown", (pointer) => {
        if (!pointer.leftButtonDown() && !pointer.wasTouch) return;
        pointer.event.stopPropagation();
        const distance = Phaser.Math.Distance.Between(
          this.player.sprite.x,
          this.player.sprite.y,
          building.entranceX * this.mapScale,
          building.entranceY * this.mapScale
        );
        if (distance > 72 * this.mapScale) {
          this.crops.toast(
            window.i18n?.t("building.comeCloser") || "Stand in front of the door first!"
          );
          return;
        }
        building.open();
      });
    });
  }

  update(_time, delta) {
    this.player?.update(delta);
    if (this.currentMap === "farm") this.crops?.update();
    this.updateChickens(delta);
    this.updateDucks(delta);
    this.updateMapCollisionDebug();
  }

  syncChickensFromState(state) {
    const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
    const chickenCount = inventory.find((item) => item.item === "chicken")?.quantity || 0;
    const duckCount = inventory.find((item) => item.item === "duck")?.quantity || 0;
    this.setChickenCount(chickenCount);
    this.setDuckCount(duckCount);
  }

  async syncChickensFromServer() {
    if (this.crops?.battleMode || this.chickenSyncing) return;
    this.chickenSyncing = true;
    try {
      const state = await this.inventory.fetchState();
      this.crops.inventoryCounts = new Map(state.inventory.map((item) => [item.item, item.quantity]));
      this.syncChickensFromState(state);
      this.updateMapVisibility();
    } catch {
      // The HUD/drawer already report request errors; keep chickens as-is if sync fails.
    } finally {
      this.chickenSyncing = false;
    }
  }

  setChickenCount(count) {
    const safeCount = Math.max(0, Number(count) || 0);
    while (this.chickens.length > safeCount) {
      const chicken = this.chickens.pop();
      this.farmOnlyObjects = this.farmOnlyObjects.filter((object) =>
        object !== chicken.sprite && object !== chicken.shadow
      );
      chicken.sprite.destroy();
      chicken.shadow.destroy();
    }
    while (this.chickens.length < safeCount) {
      this.createChicken(this.chickens.length);
    }
  }

  createChicken(index) {
    const point = this.getRandomChickenPoint();
    const shadow = this.add.ellipse(point.x, point.y - 2, 21, 7, 0x1b130c, .2)
      .setDepth(point.y - 1)
      .setVisible(this.currentMap === "farm");
    const sprite = new AnimalRig(this, point.x, point.y, "chicken")
      .setScale(.72 + Math.random() * .08)
      .setDepth(point.y)
      .setVisible(this.currentMap === "farm");
    const chicken = {
      sprite,
      shadow,
      speed: 26 + Math.random() * 22,
      phase: index * .9 + Math.random() * Math.PI,
      pauseUntil: 0,
      target: this.getRandomChickenPoint()
    };
    this.chickens.push(chicken);
    this.farmOnlyObjects.push(shadow, sprite);
    return chicken;
  }

  getRandomChickenPoint() {
    const area = Phaser.Utils.Array.GetRandom(this.chickenRoamAreas);
    return {
      x: (area.x + Math.random() * area.width) * this.mapScale,
      y: (area.y + Math.random() * area.height) * this.mapScale
    };
  }

  updateChickens(delta) {
    if (this.currentMap !== "farm" || !this.chickens.length) return;
    const now = this.time.now;
    this.chickens.forEach((chicken) => {
      const sprite = chicken.sprite;
      if (now < chicken.pauseUntil) {
        sprite.updateWalk(delta, false);
        sprite.setRotation(Math.sin(now * .006 + chicken.phase) * .025);
        return;
      }

      const dx = chicken.target.x - sprite.x;
      const dy = chicken.target.y - sprite.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 5) {
        chicken.target = this.getRandomChickenPoint();
        chicken.pauseUntil = now + Phaser.Math.Between(250, 950);
        return;
      }

      const step = Math.min(distance, chicken.speed * (delta / 1000));
      sprite.x += (dx / distance) * step;
      sprite.y += (dy / distance) * step;
      sprite.flipX = dx < 0;
      sprite.setDirection(dx, dy);
      sprite.updateWalk(delta);
      sprite.setRotation(Math.sin(now * .012 + chicken.phase) * .045);
      sprite.setDepth(sprite.y + 2);
      chicken.shadow.setPosition(sprite.x, sprite.y - 2);
      chicken.shadow.setDepth(sprite.y + 1);
    });
  }

  clearChickens() {
    this.chickens?.forEach((chicken) => {
      chicken.sprite.destroy();
      chicken.shadow.destroy();
    });
    this.chickens = [];
  }

  setDuckCount(count) {
    const safeCount = Math.max(0, Number(count) || 0);
    while (this.ducks.length > safeCount) {
      const duck = this.ducks.pop();
      this.farmOnlyObjects = this.farmOnlyObjects.filter((object) =>
        object !== duck.sprite && object !== duck.shadow
      );
      duck.sprite.destroy();
      duck.shadow.destroy();
    }
    while (this.ducks.length < safeCount) {
      this.createDuck(this.ducks.length);
    }
  }

  createDuck(index) {
    const point = this.getRandomChickenPoint();
    const shadow = this.add.ellipse(point.x, point.y - 2, 22, 7, 0x1b130c, .2)
      .setDepth(point.y - 1)
      .setVisible(this.currentMap === "farm");
    const sprite = new AnimalRig(this, point.x, point.y, "duck")
      .setScale(.75 + Math.random() * .08)
      .setDepth(point.y)
      .setVisible(this.currentMap === "farm");
    const duck = {
      sprite,
      shadow,
      speed: 22 + Math.random() * 18,
      phase: index * 1.1 + Math.random() * Math.PI,
      pauseUntil: 0,
      target: this.getRandomChickenPoint()
    };
    this.ducks.push(duck);
    this.farmOnlyObjects.push(shadow, sprite);
  }

  updateDucks(delta) {
    if (this.currentMap !== "farm" || !this.ducks.length) return;
    const now = this.time.now;
    this.ducks.forEach((duck) => {
      const dx = duck.target.x - duck.sprite.x;
      const dy = duck.target.y - duck.sprite.y;
      const distance = Math.hypot(dx, dy);
      if (now < duck.pauseUntil) {
        duck.sprite.updateWalk(delta, false);
        return;
      }
      if (distance < 5) {
        duck.target = this.getRandomChickenPoint();
        duck.pauseUntil = now + Phaser.Math.Between(350, 1100);
        return;
      }
      const step = Math.min(distance, duck.speed * (delta / 1000));
      duck.sprite.x += (dx / distance) * step;
      duck.sprite.y += (dy / distance) * step;
      duck.sprite.flipX = dx < 0;
      duck.sprite.setDirection(dx, dy);
      duck.sprite.updateWalk(delta);
      duck.sprite.setRotation(Math.sin(now * .01 + duck.phase) * .035);
      duck.sprite.setDepth(duck.sprite.y + 2);
      duck.shadow.setPosition(duck.sprite.x, duck.sprite.y - 2).setDepth(duck.sprite.y + 1);
    });
  }

  clearDucks() {
    this.ducks?.forEach((duck) => {
      duck.sprite.destroy();
      duck.shadow.destroy();
    });
    this.ducks = [];
  }

  resizeView() {
    const width = this.scale.width;
    const height = this.scale.height;
    const zoom = Math.max(width / this.baseMapWidth, height / this.baseMapHeight);
    this.cameras.main.setViewport(0, 0, width, height);
    this.cameras.main.setZoom(zoom);
  }

  setGameInteractive(object, options = {}) {
    object.setInteractive({
      ...options,
      cursor: options.cursor || CURSOR_POINTER
    });
    object.on("pointerover", () => window.setImmortalCursorInteractive?.(true));
    object.on("pointerout", () => window.setImmortalCursorInteractive?.(false));
    object.once("destroy", () => window.setImmortalCursorInteractive?.(false));
    return object;
  }

  createWellInteraction() {
    this.wellCollectionMs = 3000;
    this.wellX = FARM_LAYOUT.well.x * this.mapScale;
    this.wellY = FARM_LAYOUT.well.y * this.mapScale;
    this.wellCollecting = false;
    this.wellRequesting = false;

    this.wellInteraction = this.add.zone(
      this.wellX,
      this.wellY + FARM_LAYOUT.well.zoneOffsetY * this.mapScale,
      FARM_LAYOUT.well.width * this.mapScale,
      FARM_LAYOUT.well.height * this.mapScale
    )
      .setDepth(13);
    this.setGameInteractive(this.wellInteraction);
    this.farmOnlyObjects.push(this.wellInteraction);
    this.wellInteraction.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown() && !pointer.wasTouch) return;
      pointer.event.stopPropagation();
      this.collectWater();
    });
  }

  createMapGateInteractions() {
    this.farmGate = this.createMapGate({
      map: "farm",
      x: FARM_LAYOUT.farmGate.x * this.mapScale,
      y: FARM_LAYOUT.farmGate.y * this.mapScale,
      width: FARM_LAYOUT.farmGate.width * this.mapScale,
      height: FARM_LAYOUT.farmGate.height * this.mapScale,
      entranceX: FARM_LAYOUT.farmGate.entranceX * this.mapScale,
      entranceY: FARM_LAYOUT.farmGate.entranceY * this.mapScale,
      targetMap: "sea",
      interactRadius: 44 * this.mapScale,
      questionKey: "travel.toSeaQuestion",
      subtitleKey: "travel.toSeaSubtitle"
    });
    this.seaGate = this.createMapGate({
      map: "sea",
      x: 535 * this.mapScale,
      y: 58 * this.mapScale,
      width: 170 * this.mapScale,
      height: 95 * this.mapScale,
      entranceX: 535 * this.mapScale,
      entranceY: 82 * this.mapScale,
      targetMap: "farm",
      interactRadius: 44 * this.mapScale,
      questionKey: "travel.toFarmQuestion",
      subtitleKey: "travel.toFarmSubtitle"
    });
    this.farmOnlyObjects.push(this.farmGate);
    this.seaOnlyObjects.push(this.seaGate);
  }

  createFarmEventDebug() {
    if (new URLSearchParams(window.location.search).get("debugMap") !== "1") return;

    this.createFarmLayoutEditor();
    this.renderFarmEventDebugMarkers();
  }

  renderFarmEventDebugMarkers() {
    this.farmEventDebugObjects?.forEach((object) => {
      this.farmOnlyObjects = this.farmOnlyObjects.filter((item) => item !== object);
      object.destroy();
    });
    this.farmEventDebugObjects = [];
    const plotLayout = this.crops.layout;
    const patchSpan = (plotLayout.patchCols - 1) * plotLayout.plotSpacingX;
    const totalSpan = patchSpan * 2 + plotLayout.patchGapX;
    const leftStart = plotLayout.gridCenterX - totalSpan / 2 + plotLayout.leftPatchOffsetX;
    const rightStart = plotLayout.gridCenterX - totalSpan / 2
      + patchSpan + plotLayout.patchGapX + plotLayout.rightPatchOffsetX;
    const plotDebugWidth = patchSpan + plotLayout.plotWidth;
    const plotDebugHeight = (plotLayout.rows - 1) * plotLayout.plotSpacingY + plotLayout.plotHeight;
    const plotDebugY = plotLayout.gridStartY + (plotLayout.rows - 1) * plotLayout.plotSpacingY / 2;
    const markers = [
      { label: "SHOP", ...FARM_LAYOUT.shop, color: 0xffd45c },
      { label: "KHO", ...FARM_LAYOUT.storage, color: 0xff9a5c },
      {
        label: "LINH THỦY",
        ...FARM_LAYOUT.well,
        y: FARM_LAYOUT.well.y + FARM_LAYOUT.well.zoneOffsetY,
        color: 0x53e7ff
      },
      { label: "CỔNG MAP", ...FARM_LAYOUT.farmGate, color: 0xb77cff },
      {
        label: "RUỘNG TRÁI",
        x: leftStart + patchSpan / 2,
        y: plotDebugY,
        width: plotDebugWidth,
        height: plotDebugHeight,
        color: 0x8cff78
      },
      {
        label: "RUỘNG PHẢI",
        x: rightStart + patchSpan / 2,
        y: plotDebugY,
        width: plotDebugWidth,
        height: plotDebugHeight,
        color: 0x8cff78
      }
    ];

    markers.forEach((marker) => {
      const rectangle = this.add.rectangle(
        marker.x * this.mapScale,
        marker.y * this.mapScale,
        marker.width * this.mapScale,
        marker.height * this.mapScale,
        marker.color,
        .12
      ).setStrokeStyle(2, marker.color, 1).setDepth(190);
      const label = this.add.text(
        marker.x * this.mapScale,
        (marker.y - marker.height / 2 - 8) * this.mapScale,
        marker.label,
        {
          fontFamily: "monospace",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#08140ecc",
          padding: { x: 4, y: 2 }
        }
      ).setOrigin(.5, 1).setDepth(191);
      this.farmOnlyObjects.push(rectangle, label);
      this.farmEventDebugObjects.push(rectangle, label);
    });
  }

  createFarmLayoutEditor() {
    document.querySelector(".farm-layout-editor")?.remove();
    const editor = document.createElement("aside");
    editor.className = "farm-layout-editor";
    editor.hidden = true;

    document.querySelector(".farm-layout-toggle")?.remove();
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "farm-layout-toggle";
    toggle.textContent = "FARM_LAYOUT";
    toggle.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      toggle.classList.toggle("active", !editor.hidden);
    });

    const title = document.createElement("strong");
    title.textContent = "FARM_LAYOUT EDITOR";
    const hint = document.createElement("small");
    hint.textContent = "Sửa JSON rồi bấm Áp dụng để cập nhật trực tiếp.";
    const textarea = document.createElement("textarea");
    textarea.spellcheck = false;
    textarea.value = JSON.stringify(FARM_LAYOUT, null, 2);
    textarea.addEventListener("keydown", (event) => event.stopPropagation());
    textarea.addEventListener("keyup", (event) => event.stopPropagation());
    const error = document.createElement("p");
    error.className = "farm-layout-editor__error";

    const actions = document.createElement("div");
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Áp dụng";
    apply.addEventListener("click", () => {
      try {
        const nextLayout = JSON.parse(textarea.value);
        for (const [section, defaults] of Object.entries(DEFAULT_FARM_LAYOUT)) {
          if (!nextLayout[section]) throw new Error(`Thiếu mục ${section}`);
          for (const key of Object.keys(defaults)) {
            if (!Number.isFinite(Number(nextLayout[section][key]))) {
              throw new Error(`${section}.${key} phải là số`);
            }
          }
        }
        Object.entries(nextLayout).forEach(([section, values]) => {
          Object.assign(FARM_LAYOUT[section], Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, Number(value)])
          ));
        });
        localStorage.setItem(FARM_LAYOUT_STORAGE_KEY, JSON.stringify(FARM_LAYOUT));
        this.applyFarmLayoutLive();
        textarea.value = JSON.stringify(FARM_LAYOUT, null, 2);
        error.textContent = "Đã áp dụng trực tiếp.";
      } catch (cause) {
        error.textContent = cause.message || "JSON không hợp lệ";
      }
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Mặc định";
    reset.addEventListener("click", () => {
      localStorage.removeItem(FARM_LAYOUT_STORAGE_KEY);
      Object.entries(DEFAULT_FARM_LAYOUT).forEach(([section, values]) => {
        Object.assign(FARM_LAYOUT[section], values);
      });
      textarea.value = JSON.stringify(FARM_LAYOUT, null, 2);
      this.applyFarmLayoutLive();
      error.textContent = "Đã khôi phục mặc định.";
    });
    actions.append(apply, reset);
    editor.append(title, hint, textarea, error, actions);
    document.body.append(toggle, editor);
    this.farmLayoutEditor = editor;
    this.farmLayoutToggle = toggle;
  }

  applyFarmLayoutLive() {
    if (this.currentMap === "farm") {
      this.player.sprite.setPosition(
        FARM_LAYOUT.playerSpawn.x * this.mapScale,
        FARM_LAYOUT.playerSpawn.y * this.mapScale
      );
      this.player.cancelMove();
    }

    this.buildingInteractions?.forEach(({ building, hitArea }) => {
      const next = FARM_LAYOUT[building.key];
      Object.assign(building, next);
      hitArea.setPosition(next.x * this.mapScale, next.y * this.mapScale);
      hitArea.setSize(next.width * this.mapScale, next.height * this.mapScale);
      hitArea.input?.hitArea?.setTo?.(0, 0, hitArea.width, hitArea.height);
    });

    this.wellX = FARM_LAYOUT.well.x * this.mapScale;
    this.wellY = FARM_LAYOUT.well.y * this.mapScale;
    this.wellInteraction
      .setPosition(this.wellX, this.wellY + FARM_LAYOUT.well.zoneOffsetY * this.mapScale)
      .setSize(FARM_LAYOUT.well.width * this.mapScale, FARM_LAYOUT.well.height * this.mapScale);
    this.wellInteraction.input?.hitArea?.setTo?.(
      0,
      0,
      this.wellInteraction.width,
      this.wellInteraction.height
    );

    const gate = FARM_LAYOUT.farmGate;
    this.farmGate
      .setPosition(gate.x * this.mapScale, gate.y * this.mapScale)
      .setSize(gate.width * this.mapScale, gate.height * this.mapScale);
    Object.assign(this.farmGate.config, {
      x: gate.x * this.mapScale,
      y: gate.y * this.mapScale,
      width: gate.width * this.mapScale,
      height: gate.height * this.mapScale,
      entranceX: gate.entranceX * this.mapScale,
      entranceY: gate.entranceY * this.mapScale
    });
    this.farmGate.input?.hitArea?.setTo?.(0, 0, this.farmGate.width, this.farmGate.height);
    this.mapConfigs.farm.spawnFromSea.x = gate.x * this.mapScale;
    this.crops.applyDebugLayout(FARM_LAYOUT.plots);
    this.renderFarmEventDebugMarkers();
  }

  createFarmCollisions() {
    const blockers = [
      // House, barn, well and large props. Keep door fronts walkable.
      { block: 1, x: 270, y: 150, width: 320, height: 70 },
      { block: 2, x: 849, y: 150, width: 200, height: 70 },
      { block: 3, x: 996, y: 178, width: 74, height: 72 },
      { block: 4, x: 80, y: 310, width: 70, height: 440 },
      { block: 5, x: 1000, y: 310, width: 70, height: 440 },
      { block: 6, x: 550, y: 60, width: 300, height: 90 },
      { block: 7, x: 550, y: 560, width: 900, height: 78 },
      { block: 8, x: 400, y: 100, width: 100, height: 70 },
      { block: 9, x: 690, y: 120, width: 100, height: 70 },
    ];

    this.farmBlockerConfigs = blockers.map((blocker) => ({ ...blocker }));
    this.rebuildFarmBlockers();
  }

  createSeaCollisions() {
    const blockers = [
      { block: 1, x: 540, y: 25, width: 100, height: 50 },
      { block: 2, x: 460, y: 80, width: 100, height: 70 },
      { block: 3, x: 610, y: 80, width: 100, height: 70 },
      { block: 4, x: 220, y: 142, width: 400, height: 84 },
      { block: 5, x: 80, y: 330, width: 140, height: 300 },
      { block: 6, x: 670, y: 135, width: 88, height: 50 },
      { block: 7, x: 850, y: 180, width: 300, height: 60 },
      { block: 8, x: 980, y: 350, width: 100, height: 300 },
      { block: 9, x: 280, y: 530, width: 400, height: 110 },
      { block: 10, x: 800, y: 530, width: 486, height: 110 },
      { block: 11, x: 520, y: 544, width: 90, height: 92 },
      { block: 12, x: 480, y: 460, width: 10, height: 150 },
      { block: 13, x: 555, y: 460, width: 10, height: 150 }
    ];

    this.seaBlockerConfigs = blockers.map((blocker) => ({ ...blocker }));
    this.rebuildSeaBlockers();
  }

  createMapCollisionDebug() {
    const params = new URLSearchParams(window.location.search);
    this.mapCollisionDebugEnabled = params.get("debugMap") === "1";
    this.seaDebugObjects = [];
    this.createSeaDebugObjects();

    document.querySelector(".sea-debug-edit-button")?.remove();
    document.querySelector(".sea-blocker-editor")?.remove();
    this.seaDebugEditButton = document.createElement("button");
    this.seaDebugEditButton.type = "button";
    this.seaDebugEditButton.className = "sea-debug-edit-button";
    this.seaDebugEditButton.textContent = "Edit blockers";
    this.seaDebugEditButton.hidden = true;
    this.seaDebugEditButton.addEventListener("click", () => {
      this.openSeaBlockerEditor();
    });
    document.body.appendChild(this.seaDebugEditButton);

    this.seaDebugText = this.add.text(10, 10, "", {
      fontFamily: "Consolas, monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#fff4b8",
      backgroundColor: "#10251bcc",
      padding: { x: 7, y: 5 }
    })
      .setScrollFactor(0)
      .setDepth(150)
      .setVisible(false);

    this.input.keyboard?.on("keydown-B", () => {
      this.mapCollisionDebugEnabled = !this.mapCollisionDebugEnabled;
      this.updateSeaDebugVisibility();
    });
    this.updateSeaDebugVisibility();
  }

  createSeaDebugObjects() {
    this.getCurrentBlockerConfigs().forEach((blocker, index) => {
      const rect = this.add.rectangle(
        blocker.x * this.mapScale,
        blocker.y * this.mapScale,
        blocker.width * this.mapScale,
        blocker.height * this.mapScale,
        0xff2f2f,
        .24
      )
        .setStrokeStyle(2, 0xfff0a8, .95)
        .setDepth(130)
        .setVisible(false);
      const label = this.add.text(
        (blocker.x - blocker.width / 2 + 5) * this.mapScale,
        (blocker.y - blocker.height / 2 + 4) * this.mapScale,
        String(blocker.block ?? index + 1),
        {
          fontFamily: "Consolas, monospace",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#fff4b8",
          backgroundColor: "#531616cc",
          padding: { x: 3, y: 1 }
        }
      )
        .setDepth(131)
        .setVisible(false);
      this.seaDebugObjects.push(rect, label);
    });
  }

  updateMapCollisionDebug() {
    if (!this.seaDebugText?.visible) return;
    const pointer = this.input.activePointer;
    this.seaDebugText.setText(
      `${this.currentMap} blockers: B toggle\nPointer: x=${Math.round(pointer.worldX)} y=${Math.round(pointer.worldY)}`
    );
  }

  updateSeaDebugVisibility() {
    const visible = (this.currentMap === "farm" || this.currentMap === "sea") && this.mapCollisionDebugEnabled;
    this.seaDebugObjects?.forEach((object) => object.setVisible(visible));
    this.seaDebugText?.setVisible(visible);
    if (this.seaDebugEditButton) this.seaDebugEditButton.hidden = !visible;
  }

  getCurrentBlockerConfigs() {
    return this.currentMap === "farm" ? this.farmBlockerConfigs : this.seaBlockerConfigs;
  }

  resolveMoveTarget(x, y, margin = 16) {
    const bounds = this.physics.world.bounds;
    let targetX = Phaser.Math.Clamp(x, bounds.left + margin, bounds.right - margin);
    let targetY = Phaser.Math.Clamp(y, bounds.top + margin, bounds.bottom - margin);

    this.getCurrentBlockerConfigs().forEach((blocker) => {
      const centerX = blocker.x * this.mapScale;
      const centerY = blocker.y * this.mapScale;
      const halfWidth = blocker.width * this.mapScale / 2 + margin;
      const halfHeight = blocker.height * this.mapScale / 2 + margin;
      const left = centerX - halfWidth;
      const right = centerX + halfWidth;
      const top = centerY - halfHeight;
      const bottom = centerY + halfHeight;

      if (targetX < left || targetX > right || targetY < top || targetY > bottom) return;

      const nearestEdges = [
        { distance: Math.abs(targetX - left), x: left, y: targetY },
        { distance: Math.abs(right - targetX), x: right, y: targetY },
        { distance: Math.abs(targetY - top), x: targetX, y: top },
        { distance: Math.abs(bottom - targetY), x: targetX, y: bottom }
      ];
      const nearest = nearestEdges.reduce((best, edge) =>
        edge.distance < best.distance ? edge : best
      );
      targetX = Phaser.Math.Clamp(nearest.x, bounds.left + margin, bounds.right - margin);
      targetY = Phaser.Math.Clamp(nearest.y, bounds.top + margin, bounds.bottom - margin);
    });

    return { x: targetX, y: targetY };
  }

  setCurrentBlockerConfigs(blockers) {
    if (this.currentMap === "farm") {
      this.farmBlockerConfigs = blockers;
      this.rebuildFarmBlockers();
    } else {
      this.seaBlockerConfigs = blockers;
      this.rebuildSeaBlockers();
    }
  }

  rebuildFarmBlockers() {
    this.clearFarmBlockers();
    this.farmBlockers = this.physics.add.staticGroup();
    this.farmBlockerZones = this.farmBlockerConfigs.map((blocker) => this.addFarmBlocker(blocker));
    this.farmPlayerCollider = this.physics.add.collider(
      this.player.sprite,
      this.farmBlockers,
      () => this.player.cancelMove()
    );
    this.farmPlayerCollider.active = this.currentMap === "farm";
  }

  clearFarmBlockers() {
    this.farmPlayerCollider?.destroy();
    this.farmPlayerCollider = null;
    this.farmBlockerZones?.forEach((zone) => {
      this.farmOnlyObjects = this.farmOnlyObjects.filter((object) => object !== zone);
      zone.destroy();
    });
    this.farmBlockerZones = [];
    this.farmBlockers?.clear(true, true);
    this.farmBlockers = null;
  }

  rebuildSeaBlockers() {
    this.clearSeaBlockers();
    this.seaBlockers = this.physics.add.staticGroup();
    this.seaBlockerZones = this.seaBlockerConfigs.map((blocker) => this.addSeaBlocker(blocker));
    this.seaPlayerCollider = this.physics.add.collider(
      this.player.sprite,
      this.seaBlockers,
      () => this.player.cancelMove()
    );
    this.seaPlayerCollider.active = this.currentMap === "sea";
  }

  clearSeaBlockers() {
    this.seaPlayerCollider?.destroy();
    this.seaPlayerCollider = null;
    this.seaBlockerZones?.forEach((zone) => {
      this.seaOnlyObjects = this.seaOnlyObjects.filter((object) => object !== zone);
      zone.destroy();
    });
    this.seaBlockerZones = [];
    this.seaBlockers?.clear(true, true);
    this.seaBlockers = null;
  }

  rebuildSeaDebugObjects() {
    this.seaDebugObjects?.forEach((object) => object.destroy());
    this.seaDebugObjects = [];
    this.createSeaDebugObjects();
    this.updateSeaDebugVisibility();
  }

  openSeaBlockerEditor() {
    this.closeSeaBlockerEditor();

    const mapName = this.currentMap;
    const overlay = document.createElement("div");
    overlay.className = "sea-blocker-editor";
    overlay.innerHTML = `
      <section class="sea-blocker-editor__panel">
        <div class="sea-blocker-editor__header">
          <h2>${mapName[0].toUpperCase()}${mapName.slice(1)} blockers matrix</h2>
          <button class="sea-blocker-editor__close" type="button" aria-label="Close">×</button>
        </div>
        <p>Edit x, y, width, height. Each line updates the red boxes and collision zones live.</p>
        <textarea spellcheck="false"></textarea>
        <div class="sea-blocker-editor__footer">
          <span class="sea-blocker-editor__status">Ready</span>
          <button class="sea-blocker-editor__copy" type="button">Copy matrix</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector("textarea");
    const status = overlay.querySelector(".sea-blocker-editor__status");
    textarea.value = this.formatBlockerMatrix(this.getCurrentBlockerConfigs());

    const applyMatrix = () => {
      try {
        const next = this.parseBlockerMatrix(textarea.value);
        this.validateSeaBlockerMatrix(next);
        const normalized = next.map((blocker, index) => ({
          block: Number(blocker.block ?? index + 1),
          x: Number(blocker.x),
          y: Number(blocker.y),
          width: Number(blocker.width),
          height: Number(blocker.height)
        }));
        this.setCurrentBlockerConfigs(normalized);
        this.rebuildSeaDebugObjects();
        status.textContent = `Applied ${normalized.length} blockers`;
        status.classList.remove("error");
      } catch (error) {
        status.textContent = error.message;
        status.classList.add("error");
      }
    };

    let applyTimer = null;
    textarea.addEventListener("input", () => {
      clearTimeout(applyTimer);
      applyTimer = setTimeout(applyMatrix, 180);
    });
    overlay.querySelector(".sea-blocker-editor__close").addEventListener("click", () => {
      this.closeSeaBlockerEditor();
    });
    overlay.querySelector(".sea-blocker-editor__copy").addEventListener("click", async () => {
      await navigator.clipboard?.writeText(this.formatBlockerMatrix(this.getCurrentBlockerConfigs()));
      status.textContent = "Copied current matrix";
      status.classList.remove("error");
    });

    this.seaBlockerEditor = overlay;
    textarea.focus();
  }

  formatBlockerMatrix(blockers) {
    return blockers
      .map((blocker, index) => `{ block: ${blocker.block ?? index + 1}, x: ${blocker.x}, y: ${blocker.y}, width: ${blocker.width}, height: ${blocker.height} },`)
      .join("\n");
  }

  parseBlockerMatrix(source) {
    const objectMatches = [...source.matchAll(/\{[^{}]*\}/g)];
    if (!objectMatches.length) throw new Error("Add at least one blocker object.");

    return objectMatches.map((match, index) => {
      const objectSource = match[0];
      const blockMatch = objectSource.match(/block\s*:\s*(-?\d+(?:\.\d+)?)/);
      const blocker = { block: blockMatch ? Number(blockMatch[1]) : index + 1 };
      for (const key of ["x", "y", "width", "height"]) {
        const keyMatch = objectSource.match(new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
        if (!keyMatch) throw new Error(`Blocker ${index}: missing ${key}.`);
        blocker[key] = Number(keyMatch[1]);
      }
      return blocker;
    });
  }

  closeSeaBlockerEditor() {
    this.seaBlockerEditor?.remove();
    this.seaBlockerEditor = null;
  }

  validateSeaBlockerMatrix(matrix) {
    if (!Array.isArray(matrix)) throw new Error("Matrix must be an array.");
    matrix.forEach((blocker, index) => {
      if (!Number.isFinite(Number(blocker?.block))) {
        throw new Error(`Blocker ${index}: block must be a number.`);
      }
      for (const key of ["x", "y", "width", "height"]) {
        if (!Number.isFinite(Number(blocker?.[key]))) {
          throw new Error(`Blocker ${index}: ${key} must be a number.`);
        }
      }
      if (Number(blocker.width) <= 0 || Number(blocker.height) <= 0) {
        throw new Error(`Blocker ${index}: width/height must be positive.`);
      }
    });
  }

  addSeaBlocker({ x, y, width, height }) {
    const zone = this.add.zone(x * this.mapScale, y * this.mapScale, width * this.mapScale, height * this.mapScale)
      .setOrigin(.5);
    this.physics.add.existing(zone, true);
    this.seaBlockers.add(zone);
    this.seaOnlyObjects.push(zone);
    return zone;
  }

  addFarmBlocker({ x, y, width, height }) {
    const zone = this.add.zone(x * this.mapScale, y * this.mapScale, width * this.mapScale, height * this.mapScale)
      .setOrigin(.5);
    this.physics.add.existing(zone, true);
    this.farmBlockers.add(zone);
    this.farmOnlyObjects.push(zone);
    return zone;
  }

  createMapGate(config) {
    const gate = this.add.zone(config.x, config.y, config.width, config.height)
      .setDepth(4);
    this.setGameInteractive(gate);
    gate.config = config;
    gate.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown() && !pointer.wasTouch) return;
      pointer.event.stopPropagation();
      if (this.currentMap !== config.map) return;
      const distance = Phaser.Math.Distance.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        config.entranceX,
        config.entranceY
      );
      if (distance > config.interactRadius) {
        this.crops.toast(
          window.i18n?.t("building.comeCloser") || "Stand in front of the door first!"
        );
        return;
      }
      this.showTravelConfirm(config);
    });
    return gate;
  }

  showTravelConfirm(config) {
    if (this.travelConfirm) window.closeGameModal?.(false);
    const content = document.createElement("p");
    content.className = "game-modal__price";
    content.textContent = `${config.targetMap === "sea" ? "🌊" : "🏡"} ${this.t(config.questionKey)}`;
    this.travelConfirm = true;
    window.openGameModal({
      title: this.t("travel.title"),
      subtitle: this.t(config.subtitleKey),
      content,
      actions: [
        { label: this.t("travel.cancel"), onClick: () => { this.travelConfirm = null; } },
        {
          label: this.t("travel.confirm"),
          primary: true,
          onClick: () => {
            this.travelConfirm = null;
            this.switchMap(config.targetMap);
          }
        }
      ],
      onClose: () => { this.travelConfirm = null; }
    });
  }

  t(key) {
    return window.i18n?.t(key) || key;
  }

  switchMap(mapName) {
    if (!this.mapConfigs[mapName] || this.currentMap === mapName || this.mapSwitching) return;
    this.mapSwitching = true;
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.player.cancelMove();
    this.player.sprite.setVelocity(0);
    this.cameras.main.fadeOut(400, 5, 18, 28);
    this.time.delayedCall(1000, () => this.completeMapSwitch(mapName));
  }

  completeMapSwitch(mapName) {
    this.currentMap = mapName;
    this.player.stopWaterCollection();
    this.closeFarmPopups();
    if (this.travelConfirm) window.closeGameModal?.(false);
    this.travelConfirm = null;
    this.rebuildSeaDebugObjects();
    this.updateMapVisibility();
    this.applyMapBounds(mapName);

    const spawn = mapName === "sea"
      ? this.mapConfigs.sea.spawnFromFarm
      : this.mapConfigs.farm.spawnFromSea;
    this.player.sprite.setPosition(spawn.x, spawn.y);
    this.player.updateShadow();
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.cameras.main.fadeIn(650, 5, 18, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.mapSwitching = false;
      const inputEnabled = window.gameInputEnabled !== false;
      this.input.enabled = inputEnabled;
      if (this.input.keyboard) this.input.keyboard.enabled = inputEnabled;
    });
  }

  applyMapBounds(mapName) {
    const bounds = this.mapConfigs[mapName].bounds;
    this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.farmPlayerCollider) this.farmPlayerCollider.active = mapName === "farm";
    if (this.seaPlayerCollider) this.seaPlayerCollider.active = mapName === "sea";
  }

  updateMapVisibility() {
    this.backgrounds.farm.setVisible(this.currentMap === "farm");
    this.backgrounds.sea.setVisible(this.currentMap === "sea");
    this.setObjectsVisible(this.farmOnlyObjects, this.currentMap === "farm");
    this.setObjectsVisible(this.seaOnlyObjects, this.currentMap === "sea");
    this.crops?.setVisible?.(this.currentMap === "farm");
    this.updateSeaDebugVisibility();
  }

  setObjectsVisible(objects, visible) {
    objects.forEach((object) => {
      object?.setVisible(visible).setActive(visible);
      if (object?.input) object.input.enabled = visible;
    });
  }

  closeFarmPopups() {
    this.crops?.closeSeedPopup?.();
    this.crops?.closeConfirmPopup?.();
  }

  restoreWellCollection(startedAt) {
    if (!startedAt) return;
    const readyAt = Number(startedAt) + this.wellCollectionMs;
    if (Date.now() >= readyAt) {
      this.collectWater(false);
    } else {
      this.startWellCountdown(readyAt);
    }
  }

  async collectWater(requireNearby = true) {
    if (this.wellRequesting) return;
    if (requireNearby) {
      const distance = Phaser.Math.Distance.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        this.wellX,
        this.wellY
      );
      if (distance > 120) {
        this.crops.toast(window.i18n?.t("well.comeCloser") || "Move closer to the well!");
        return;
      }
    }
    if (this.wellCollecting) {
      const seconds = Math.max(1, Math.ceil((this.wellReadyAt - Date.now()) / 1000));
      this.crops.toast(window.i18n?.t("well.collecting", { seconds }) || `Collecting water: ${seconds}`);
      return;
    }

    if (this.crops?.battleMode) {
      if (requireNearby) {
        this.startWellCountdown(Date.now() + this.wellCollectionMs);
      } else {
        const waterCount = this.crops.inventoryCounts.get("water") || 0;
        this.crops.inventoryCounts.set("water", waterCount + 1);
        this.showWaterCollectedModal();
      }
      return;
    }

    this.wellRequesting = true;
    const result = await this.inventory.request("/api/game/well/collect");
    this.wellRequesting = false;

    if (result.collecting) {
      this.startWellCountdown(Number(result.readyAt));
    } else if (result.collected) {
      await this.crops.refreshInventoryCounts();
      this.crops.changed();
      this.showWaterCollectedModal();
    } else {
      this.crops.toast(result.error);
    }
  }

  showWaterCollectedModal() {
    if (!window.openGameModal) {
      this.crops.toast(window.i18n?.t("well.collected") || "+1 water", "success");
      return;
    }

    const reward = document.createElement("div");
    reward.className = "flex items-center justify-center gap-4 rounded-2xl border border-[#71dfff66] bg-[radial-gradient(circle_at_center,#164e5dcc,#09252bcc)] px-5 py-4 shadow-[inset_0_1px_0_#fff2,0_0_28px_#43cfff22]";

    const image = document.createElement("img");
    image.src = "/assets/tiles/water-drop.png";
    image.alt = window.i18n?.t("item.water") || "Spirit water";
    image.className = "size-20 object-contain drop-shadow-[0_0_14px_#5ee7ff99]";

    const amount = document.createElement("strong");
    amount.textContent = "+1";
    amount.className = "font-cultivation text-4xl font-black text-[#baf7ff] drop-shadow-[0_0_10px_#4bdcff88]";
    reward.append(image, amount);

    window.openGameModal({
      content: reward,
      passive: true,
      dismissAfter: 2000
    });
  }

  startWellCountdown(readyAt) {
    this.wellTimerEvent?.remove();
    this.wellReadyAt = readyAt;
    this.wellCollecting = true;
    this.player.startWaterCollection(
      Math.max(0, readyAt - Date.now()),
      this.wellX,
      this.wellY
    );

    const completeCollection = () => {
      this.wellTimerEvent = null;
      this.wellCollecting = false;
      this.player.stopWaterCollection();
      this.collectWater(false);
    };
    const remaining = Math.max(0, this.wellReadyAt - Date.now());
    if (remaining === 0) completeCollection();
    else this.wellTimerEvent = this.time.delayedCall(remaining, completeCollection);
  }
}
