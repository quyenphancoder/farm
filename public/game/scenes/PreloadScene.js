export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    this.load.on("progress", (value) => {
      document.body.dispatchEvent(new CustomEvent("game:loading-progress", {
        detail: {
          progress: 5 + value * 85,
          status: window.i18n?.t(value < .55 ? "loading.summoning" : "loading.awakening")
        }
      }));
    });
    this.load.image("farm-background", "/assets/tiles/farm-background-flat.png");
    this.load.image("sea-background", "/assets/tiles/sea-background-flat.png");
    this.load.image("plot", "/assets/tiles/soil.png");
    this.load.image("soil-lock", "/assets/tiles/soil-lock.png");
    this.load.image("water-drop", "/assets/tiles/water-drop.png");
    this.load.image("carrot", "/assets/crops/carrot.png");
    this.load.image("corn", "/assets/crops/corn.png");
    for (const animal of ["chicken", "duck"]) {
      this.load.svg(`${animal}-body`, `/assets/animals/${animal}-body.svg`);
      this.load.svg(`${animal}-head`, `/assets/animals/${animal}-head.svg`);
      this.load.svg(`${animal}-leg`, `/assets/animals/${animal}-leg.svg`);
    }
    this.loadFarmerSprites();
  }

  create() {
    document.body.dispatchEvent(new CustomEvent("game:loading-progress", {
      detail: { progress: 92, status: window.i18n?.t("loading.syncing") }
    }));
    this.createFarmerAvatar();
    this.createLockShadowTexture();
    this.setFarmerTextureFilters();
    this.textures.get("plot").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("soil-lock").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("water-drop").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("farm-background").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("sea-background").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("carrot").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("corn").setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const animal of ["chicken", "duck"]) {
      for (const part of ["body", "head", "leg"]) {
        this.textures.get(`${animal}-${part}`).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    this.scene.start("FarmScene");
  }

  createLockShadowTexture() {
    if (this.textures.exists("soil-lock-shadow")) return;
    const texture = this.textures.createCanvas("soil-lock-shadow", 40, 14);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(20, 7, 1, 20, 7, 18);
    gradient.addColorStop(0, "rgba(0, 0, 0, .58)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(20, 7, 18, 5.5, 0, 0, Math.PI * 2);
    context.fill();
    texture.refresh();
  }

  createFarmerAvatar() {
    const avatar = document.querySelector("#player-avatar");
    if (!avatar) return;
    avatar.src = "/assets/characters/sprites/walk/walk0.png";
  }

  loadFarmerSprites() {
    const sprites = {
      down: ["walk", "walk"],
      up: ["walk-top", "walktop"],
      left: ["walk-left", "walkleft"],
      right: ["walk-right", "walkright"]
    };
    for (const [direction, [folder, filePrefix]] of Object.entries(sprites)) {
      for (let frame = 0; frame <= 4; frame += 1) {
        this.load.image(
          `farmer-${direction}-${frame}`,
          `/assets/characters/sprites/${folder}/${filePrefix}${frame}.png`
        );
      }
    }
  }

  setFarmerTextureFilters() {
    for (const direction of ["down", "up", "left", "right"]) {
      for (let frame = 0; frame <= 4; frame += 1) {
        this.textures.get(`farmer-${direction}-${frame}`)
          .setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }
}
