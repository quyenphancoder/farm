export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    this.load.image("farm-background", "/assets/tiles/farm-background-flat-v3.png");
    this.load.image("plot", "/assets/tiles/soil.png");
    this.load.image("lock-flag", "/assets/tiles/lock-flag.png");
    this.loadFarmerSprites();
  }

  create() {
    this.createFarmerAvatar();
    this.setFarmerTextureFilters();
    this.textures.get("plot").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("lock-flag").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("farm-background").setFilter(Phaser.Textures.FilterMode.LINEAR);
    const graphics = this.make.graphics({ add: false });

    // A friendly carrot crop icon in the same illustrated palette.
    graphics.fillStyle(0x17351f, .25).fillEllipse(22, 52, 28, 7);
    graphics.fillStyle(0x4d9f3c).fillEllipse(17, 14, 13, 25);
    graphics.fillStyle(0x63bd4d).fillEllipse(27, 13, 13, 25);
    graphics.fillStyle(0x2f7d35).fillEllipse(22, 10, 10, 23);
    graphics.fillStyle(0xf28c28).fillTriangle(10, 20, 34, 20, 22, 54);
    graphics.lineStyle(2, 0xffbc58, .9);
    graphics.lineBetween(14, 28, 27, 31);
    graphics.lineBetween(18, 38, 28, 40);
    graphics.generateTexture("carrot", 44, 58);
    graphics.destroy();

    this.scene.start("FarmScene");
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
        this.textures
          .get(`farmer-${direction}-${frame}`)
          .setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  createFarmerAvatar() {
    const avatar = document.querySelector("#player-avatar");
    if (!avatar) return;
    avatar.src = "/assets/characters/sprites/walk/walk0.png";
  }
}
