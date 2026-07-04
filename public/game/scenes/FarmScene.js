import Player from "../systems/player.js";
import CropSystem from "../systems/cropSystem.js";
import InventorySystem from "../systems/inventorySystem.js";

export default class FarmScene extends Phaser.Scene {
  constructor() {
    super("FarmScene");
  }

  async create() {
    this.baseMapWidth = 1067;
    this.baseMapHeight = 600;
    this.mapScale = 1;
    this.mapWidth = Math.round(this.baseMapWidth * this.mapScale);
    this.mapHeight = Math.round(this.baseMapHeight * this.mapScale);
    this.mapOffsetX = this.mapWidth / 2 - 480;
    this.mapOffsetY = this.mapHeight / 2 - 300;

    this.background = this.add.image(this.mapWidth / 2, this.mapHeight / 2, "farm-background")
      .setDisplaySize(this.mapWidth, this.mapHeight);
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.resizeView();
    this.scale.on("resize", () => this.resizeView());
    this.physics.world.setBounds(
      this.mapWidth / 2 - (780 * this.mapScale) / 2,
      190 * this.mapScale,
      780 * this.mapScale,
      315 * this.mapScale
    );

    // Soft playable-area glow keeps plots readable on the detailed background.
    this.add.ellipse(
      500 + this.mapOffsetX,
      425 + this.mapOffsetY,
      490,
      250,
      0xc5e86a,
      .08
    ).setDepth(1);

    this.inventory = new InventorySystem();
    this.crops = new CropSystem(this, this.inventory);
    this.player = new Player(this, 245 + this.mapOffsetX, 430 + this.mapOffsetY);
    this.createWellInteraction();
    this.cameras.main.startFollow(this.player.sprite, true, .12, .12);

    try {
      const state = await this.crops.load();
      this.restoreWellCollection(state.player?.water_started_at);
    } catch {
      this.crops.toast(window.i18n?.t("game.loadFailed") || "Unable to load farm data.");
    }
  }

  update(_time, delta) {
    this.player?.update(delta);
    this.crops?.update();
  }

  resizeView() {
    const width = this.scale.width;
    const height = this.scale.height;
    const zoom = Math.max(width / this.baseMapWidth, height / this.baseMapHeight);
    this.cameras.main.setViewport(0, 0, width, height);
    this.cameras.main.setZoom(zoom);
  }

  createWellInteraction() {
    this.wellCollectionMs = 10000;
    this.wellX = this.mapWidth * .89;
    this.wellY = this.mapHeight * .3;
    this.wellCollecting = false;
    this.wellRequesting = false;

    this.wellTimerText = this.add.text(this.wellX, this.wellY - 72, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#e8fbff",
      backgroundColor: "#153b42e8",
      padding: { x: 6, y: 3 }
    }).setOrigin(.5).setDepth(12).setVisible(false);
    const waterButtonBackground = this.add.circle(0, 0, 11, 0x246b78, .96)
      .setStrokeStyle(1.5, 0xb9f2ff, .95);
    const waterButtonIcon = this.add.text(0, 0, "💧", {
      fontFamily: "Arial, sans-serif",
      fontSize: "11px"
    }).setOrigin(.5);
    this.wellButton = this.add.container(
      this.wellX,
      this.wellY - 38,
      [waterButtonBackground, waterButtonIcon]
    )
      .setSize(24, 24)
      .setDepth(13)
      .setInteractive({ useHandCursor: true });
    this.wellButton.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown() && !pointer.wasTouch) return;
      pointer.event.stopPropagation();
      this.collectWater();
    });
    this.tweens.add({
      targets: this.wellButton,
      scale: 1.08,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
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

    this.wellRequesting = true;
    const result = await this.inventory.request("/api/game/well/collect");
    this.wellRequesting = false;

    if (result.collecting) {
      this.startWellCountdown(Number(result.readyAt));
    } else if (result.collected) {
      await this.crops.refreshInventoryCounts();
      this.crops.changed();
      this.crops.toast(window.i18n?.t("well.collected") || "+1 water", "success");
    } else {
      this.crops.toast(result.error);
    }
  }

  startWellCountdown(readyAt) {
    this.wellTimerEvent?.remove();
    this.wellReadyAt = readyAt;
    this.wellCollecting = true;
    this.wellTimerText.setVisible(true);
    this.player.startWaterCollection(
      Math.max(0, readyAt - Date.now()),
      this.wellX,
      this.wellY
    );

    const updateCountdown = () => {
      const remaining = Math.max(0, this.wellReadyAt - Date.now());
      this.wellTimerText.setText(`💧 ${Math.ceil(remaining / 1000)}`);
      if (remaining > 0) return;

      this.wellTimerEvent?.remove();
      this.wellTimerEvent = null;
      this.wellCollecting = false;
      this.wellTimerText.setVisible(false);
      this.player.stopWaterCollection();
      this.collectWater(false);
    };
    updateCountdown();
    if (this.wellCollecting) {
      this.wellTimerEvent = this.time.addEvent({
        delay: 200,
        loop: true,
        callback: updateCountdown
      });
    }
  }
}
