import Player from "../systems/player.js";
import CropSystem from "../systems/cropSystem.js";
import InventorySystem from "../systems/inventorySystem.js";
import QuestSystem from "../systems/questSystem.js";

export default class FarmScene extends Phaser.Scene {
  constructor() {
    super("FarmScene");
  }

  async create() {
    this.background = this.add.image(480, 300, "farm-background").setDisplaySize(960, 640);
    this.resizeView();
    this.scale.on("resize", () => this.resizeView());
    this.physics.world.setBounds(42, 205, 876, 335);

    // Soft playable-area glow keeps plots readable on the detailed background.
    this.add.ellipse(500, 425, 490, 250, 0xc5e86a, .08).setDepth(1);

    this.inventory = new InventorySystem();
    this.quests = new QuestSystem();
    this.crops = new CropSystem(this, this.inventory, this.quests);
    this.player = new Player(this, 245, 430);

    try {
      await this.crops.load();
    } catch {
      this.crops.toast("Không thể tải dữ liệu nông trại.");
    }
    this.scene.launch("UIScene");
  }

  update(_time, delta) {
    this.player?.update(delta);
    this.crops?.update();
  }

  resizeView() {
    const width = this.scale.width;
    const height = this.scale.height;
    const zoom = Math.max(width / 960, height / 600);
    this.cameras.main.setViewport(0, 0, width, height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(480, 300);
  }
}
