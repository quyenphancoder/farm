export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    const tip = this.add.text(480, 116, "Chuột phải để di chuyển • WASD / phím mũi tên", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#fff7d1",
      backgroundColor: "#173326bb",
      padding: { x: 13, y: 7 }
    }).setOrigin(.5).setDepth(50);

    this.tweens.add({
      targets: tip,
      alpha: 0,
      y: 108,
      delay: 2600,
      duration: 550,
      onComplete: () => tip.destroy()
    });
  }
}
