export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload() {
    this.load.image("farm-background", "/assets/tiles/farm-background-flat-v3.png");
    this.load.image("farmer", "/assets/characters/farmer-sprites-clean-v2.png");
  }

  create() {
    this.createFarmerFrames();
    this.createFarmerAvatar();
    this.textures.get("farmer").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("farm-background").setFilter(Phaser.Textures.FilterMode.LINEAR);
    const graphics = this.make.graphics({ add: false });

    // Rich soil tile with a golden grass rim and furrows.
    graphics.fillStyle(0x23301b, .28).fillRoundedRect(3, 5, 82, 53, 11);
    graphics.fillStyle(0xb17a37).fillRoundedRect(0, 0, 84, 54, 10);
    graphics.lineStyle(3, 0x6f451f, .75);
    for (let y = 12; y <= 42; y += 10) graphics.lineBetween(8, y, 76, y);
    graphics.lineStyle(2, 0xe3b45d, .7).strokeRoundedRect(1, 1, 82, 52, 9);
    graphics.generateTexture("plot", 88, 60);
    graphics.clear();

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

  createFarmerFrames() {
    const texture = this.textures.get("farmer");
    const columns = [
      [0, 258],
      [258, 258],
      [516, 258],
      [774, 258],
      [1032, 260]
    ];
    const rows = [
      ["down", 0, 304],
      ["up", 304, 304],
      ["left", 608, 304],
      ["right", 912, 306]
    ];

    for (const [direction, y, height] of rows) {
      columns.forEach(([x, width], index) => {
        texture.add(`${direction}-${index}`, 0, x, y, width, height);
      });
    }
  }

  createFarmerAvatar() {
    const source = this.textures.get("farmer").getSourceImage();
    const avatar = document.querySelector("#player-avatar");
    if (!avatar) return;

    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 220;
    canvas.getContext("2d").drawImage(
      source,
      55, 28, 190, 190,
      0, 0, 220, 220
    );
    avatar.src = canvas.toDataURL("image/png");
  }
}
