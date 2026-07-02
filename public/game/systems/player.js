export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.baseScale = .34;
    this.lastDirection = "down";
    this.actionUntil = 0;
    this.sprite = scene.physics.add.sprite(x, y, "farmer", "down-0");
    this.sprite
      .setOrigin(.55, .91)
      .setScale(this.baseScale)
      .setCollideWorldBounds(true)
      .setDepth(10);
    this.sprite.body.setSize(72, 48).setOffset(94, 230);
    this.createAnimations();

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys("W,A,S,D");
    this.moveTarget = null;

    this.marker = scene.add.circle(x, y, 13, 0xffe787, .22)
      .setStrokeStyle(3, 0xfff2a8, .9)
      .setDepth(9)
      .setVisible(false);
    scene.tweens.add({
      targets: this.marker,
      scale: 1.35,
      alpha: .28,
      duration: 550,
      yoyo: true,
      repeat: -1
    });

    scene.input.mouse.disableContextMenu();
    scene.input.on("pointerdown", (pointer) => {
      if (pointer.rightButtonDown()) this.moveTo(pointer.worldX, pointer.worldY);
    });
  }

  createAnimations() {
    for (const direction of ["down", "up", "left", "right"]) {
      const key = `farmer-walk-${direction}`;
      if (this.scene.anims.exists(key)) continue;
      const sequence = [0, 1, 2, 3, 4, 3, 2, 1];
      this.scene.anims.create({
        key,
        frames: sequence.map((index) => ({
          key: "farmer",
          frame: `${direction}-${index}`
        })),
        frameRate: 10,
        repeat: -1
      });
    }
  }

  update() {
    if (this.scene.time.now < this.actionUntil) {
      this.sprite.setVelocity(0);
      return;
    }
    if (this.actionUntil) {
      this.actionUntil = 0;
      this.sprite.setScale(this.baseScale);
      this.setIdleFrame();
    }

    const speed = 190;
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    let keyboardX = Number(right) - Number(left);
    let keyboardY = Number(down) - Number(up);

    // Four-direction movement: never allow velocity on both axes.
    if (keyboardX) keyboardY = 0;

    if (keyboardX || keyboardY) {
      this.cancelMove();
      this.sprite.setVelocity(keyboardX * speed, keyboardY * speed);
    } else if (this.moveTarget) {
      const deltaX = this.moveTarget.x - this.sprite.x;
      const deltaY = this.moveTarget.y - this.sprite.y;
      if (Math.abs(deltaX) <= 7 && Math.abs(deltaY) <= 7) {
        this.sprite.setPosition(this.moveTarget.x, this.moveTarget.y);
        this.sprite.setVelocity(0);
        this.cancelMove();
      } else {
        if (this.moveTarget.axis === "x" && Math.abs(deltaX) <= 7) {
          this.sprite.setX(this.moveTarget.x);
          this.moveTarget.axis = "y";
        } else if (this.moveTarget.axis === "y" && Math.abs(deltaY) <= 7) {
          this.sprite.setY(this.moveTarget.y);
          this.moveTarget.axis = "x";
        }

        if (this.moveTarget.axis === "x") {
          this.sprite.setVelocity(Math.sign(this.moveTarget.x - this.sprite.x) * speed, 0);
        } else {
          this.sprite.setVelocity(0, Math.sign(this.moveTarget.y - this.sprite.y) * speed);
        }
      }
    } else {
      this.sprite.setVelocity(0);
    }

    this.updateAnimation();
  }

  updateAnimation() {
    const velocity = this.sprite.body.velocity;
    if (Math.abs(velocity.x) <= 1 && Math.abs(velocity.y) <= 1) {
      this.setIdleFrame();
      return;
    }

    if (Math.abs(velocity.x) >= Math.abs(velocity.y)) {
      this.lastDirection = velocity.x < 0 ? "left" : "right";
    } else {
      this.lastDirection = velocity.y < 0 ? "up" : "down";
    }
    this.sprite.play(`farmer-walk-${this.lastDirection}`, true);
  }

  setIdleFrame() {
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
    this.sprite.setFrame(`${this.lastDirection}-0`);
  }

  playAction(targetX, targetY, duration = 500) {
    this.cancelMove();
    this.sprite.setVelocity(0);
    const deltaX = targetX - this.sprite.x;
    const deltaY = targetY - this.sprite.y;
    this.lastDirection = Math.abs(deltaX) > Math.abs(deltaY)
      ? (deltaX < 0 ? "left" : "right")
      : (deltaY < 0 ? "up" : "down");
    this.setIdleFrame();
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.08,
      scaleY: this.baseScale * .92,
      duration: 125,
      yoyo: true,
      repeat: 1
    });
    this.actionUntil = this.scene.time.now + duration;
  }

  moveTo(x, y) {
    if (this.scene.time.now < this.actionUntil) return;
    const bounds = this.scene.physics.world.bounds;
    const targetX = Phaser.Math.Clamp(x, bounds.left + 16, bounds.right - 16);
    const targetY = Phaser.Math.Clamp(y, bounds.top + 16, bounds.bottom - 16);

    this.moveTarget = {
      x: targetX,
      y: targetY,
      axis: Math.abs(targetX - this.sprite.x) >= Math.abs(targetY - this.sprite.y)
        ? "x"
        : "y"
    };
    this.marker.setPosition(targetX, targetY).setVisible(true);
  }

  cancelMove() {
    this.moveTarget = null;
    this.marker.setVisible(false);
  }
}
