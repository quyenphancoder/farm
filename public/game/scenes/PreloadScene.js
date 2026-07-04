export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    this.load.image("farm-background", "/assets/tiles/farm-background-flat-v3.png");
    this.load.image("plot", "/assets/tiles/soil.png");
    this.load.image("carrot", "/assets/crops/carrot.png");
    this.load.image("corn", "/assets/crops/corn.png");
    this.loadFarmerSprites();
  }

  create() {
    this.createFarmerAvatar();
    this.setFarmerTextureFilters();
    this.textures.get("plot").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("farm-background").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("carrot").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("corn").setFilter(Phaser.Textures.FilterMode.LINEAR);

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
