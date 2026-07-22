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
    this.createAlignedFarmerSprites();
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
    const source = this.textures.get("farmer-aligned").getSourceImage();
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 181;
    canvas.getContext("2d").drawImage(source, 0, 0, 128, 181, 0, 0, 128, 181);
    avatar.src = canvas.toDataURL("image/png");
  }

  loadFarmerSprites() {
    this.load.spritesheet("farmer", "/assets/characters/character-sprite.png", {
      frameWidth: 181,
      frameHeight: 181
    });
  }

  createAlignedFarmerSprites() {
    const sourceFrameSize = 181;
    const frameWidth = 128;
    const frameHeight = 181;
    const columns = 12;
    const rows = 4;
    const source = this.textures.get("farmer").getSourceImage();
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = source.width;
    sourceCanvas.height = source.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(source, 0, 0);

    const alignedCanvas = document.createElement("canvas");
    alignedCanvas.width = frameWidth * columns;
    alignedCanvas.height = frameHeight * rows;
    const alignedContext = alignedCanvas.getContext("2d");
    const targetCenterX = frameWidth / 2;
    const targetBottom = 176;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const sourceX = col * sourceFrameSize;
        const sourceY = row * sourceFrameSize;
        const pixels = sourceContext
          .getImageData(sourceX, sourceY, sourceFrameSize, sourceFrameSize).data;
        let minX = sourceFrameSize;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < sourceFrameSize; y += 1) {
          for (let x = 0; x < sourceFrameSize; x += 1) {
            if (pixels[(y * sourceFrameSize + x) * 4 + 3] < 8) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        const centerX = maxX >= 0 ? (minX + maxX + 1) / 2 : targetCenterX;
        const bottom = maxY >= 0 ? maxY + 1 : targetBottom;
        const offsetX = Math.round(targetCenterX - centerX);
        const offsetY = targetBottom - bottom;
        alignedContext.drawImage(
          source,
          sourceX,
          sourceY,
          sourceFrameSize,
          sourceFrameSize,
          col * frameWidth + offsetX,
          row * frameHeight + offsetY,
          sourceFrameSize,
          sourceFrameSize
        );
      }
    }

    this.textures.addSpriteSheet("farmer-aligned", alignedCanvas, {
      frameWidth,
      frameHeight
    });
  }

  setFarmerTextureFilters() {
    this.textures.get("farmer-aligned").setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
