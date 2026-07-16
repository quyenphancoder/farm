export default class AnimalRig extends Phaser.GameObjects.Container {
  constructor(scene, x, y, type) {
    super(scene, x, y);
    scene.add.existing(this);
    this.type = type;
    this.walkTime = 0;
    this.direction = "down";

    this.backLeg = scene.add.image(-6, -7, `${type}-leg`).setOrigin(.5, .18);
    this.frontLeg = scene.add.image(6, -7, `${type}-leg`).setOrigin(.5, .18);
    this.body = scene.add.image(0, -7, `${type}-body`).setOrigin(.5, .82);
    this.head = scene.add.image(10, -23, `${type}-head`).setOrigin(.42, .72);
    this.add([this.backLeg, this.frontLeg, this.body, this.head]);
  }

  setDirection(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.direction = dx < 0 ? "left" : "right";
    } else {
      this.direction = dy < 0 ? "up" : "down";
    }
  }

  updateWalk(delta, moving = true) {
    if (moving) this.walkTime += delta * .012;
    const step = moving ? Math.sin(this.walkTime) : 0;
    const bob = moving ? Math.abs(Math.sin(this.walkTime)) * 1.5 : 0;
    const horizontal = this.direction === "left" || this.direction === "right";
    const facing = this.direction === "left" ? -1 : 1;

    this.body.y = -7 - bob;
    this.body.angle = horizontal ? step * 1.3 : 0;
    this.body.setFlipX(facing < 0);
    this.head.setFlipX(facing < 0);
    this.head.x = horizontal ? 10 * facing : 0;
    this.head.y = (this.direction === "up" ? -25 : -23) - bob;
    this.head.angle = horizontal ? step * 2.2 * facing : step * 1.2;

    const stride = horizontal ? 18 : 11;
    this.backLeg.angle = step * stride;
    this.frontLeg.angle = -step * stride;
    this.backLeg.x = horizontal ? -5 * facing : -5;
    this.frontLeg.x = horizontal ? 5 * facing : 5;
    this.backLeg.y = -7 - bob;
    this.frontLeg.y = -7 - bob;
  }
}
