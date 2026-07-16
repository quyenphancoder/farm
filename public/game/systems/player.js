export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.baseScaleX = .32;
    this.baseScaleY = .30;
    this.lastDirection = "down";
    this.actionUntil = 0;
    this.sprite = scene.physics.add.sprite(x, y, "farmer-down-0");
    this.sprite
      .setOrigin(.55, .91)
      .setScale(this.baseScaleX, this.baseScaleY)
      .setCollideWorldBounds(true)
      .setDepth(20);
    this.shadowOffsetX = this.sprite.originX - .5;
    this.sprite.body.setSize(54, 34).setOffset(42, 176);
    this.shadow = scene.add.ellipse(x, y + 5, 34, 12, 0x102015, .4)
      .setDepth(19);
    this.createAnimations();

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys("W,A,S,D");
    this.moveTarget = null;
    this.moveSpeed = 190;
    this.arrivalRadius = 3;

    this.marker = this.createMoveMarker(x, y);

    scene.input.mouse.disableContextMenu();
    scene.input.on("pointerdown", (pointer) => {
      const isTouch = pointer.wasTouch
        || pointer.event?.pointerType === "touch"
        || pointer.event?.type?.startsWith("touch");
      if (pointer.rightButtonDown() || isTouch) {
        this.moveTo(pointer.worldX, pointer.worldY);
      }
    });
  }

  createMoveMarker(x, y) {
    const glow = this.scene.add.circle(0, 0, 14, 0x4edfff, .12)
      .setStrokeStyle(1, 0xa9f5ff, .35);
    const outerRing = this.scene.add.graphics();

    outerRing.lineStyle(2.2, 0x75eaff, .95);
    for (let index = 0; index < 4; index += 1) {
      outerRing.beginPath();
      outerRing.arc(0, 0, 16, index * Math.PI / 2 + .13, index * Math.PI / 2 + 1.13);
      outerRing.strokePath();
    }
    outerRing.lineStyle(1.2, 0xffffff, .55);
    outerRing.strokeCircle(0, 0, 12);

    const marker = this.scene.add.container(x, y, [glow, outerRing])
      .setDepth(19)
      .setVisible(false);
    marker.glow = glow;
    marker.outerRing = outerRing;

    this.scene.tweens.add({
      targets: outerRing,
      angle: 360,
      duration: 2200,
      repeat: -1
    });
    this.scene.tweens.add({
      targets: glow,
      scale: 1.35,
      alpha: .18,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    return marker;
  }

  showMoveMarker(x, y) {
    this.marker.setPosition(x, y).setVisible(true).setScale(.55).setAlpha(0);
    this.scene.tweens.killTweensOf(this.marker);
    this.scene.tweens.add({
      targets: this.marker,
      scale: 1,
      alpha: 1,
      duration: 150,
      ease: "Back.easeOut"
    });
  }

  createAnimations() {
    for (const direction of ["down", "up", "left", "right"]) {
      const key = `farmer-walk-${direction}`;
      if (this.scene.anims.exists(key)) continue;
      const sequence = [1, 2, 3, 4];
      this.scene.anims.create({
        key,
        frames: sequence.map((index) => ({ key: `farmer-${direction}-${index}` })),
        frameRate: 5,
        repeat: -1
      });
    }
  }

  update(delta = 16.67) {
    if (this.scene.time.now < this.actionUntil) {
      this.sprite.setVelocity(0);
      this.updateShadow();
      return;
    }
    if (this.actionUntil) {
      this.waterCollectionTween?.stop();
      this.waterCollectionTween = null;
      this.actionUntil = 0;
      this.sprite.setScale(this.baseScaleX, this.baseScaleY);
      this.setIdleFrame();
    }

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;
    const keyboardX = Number(right) - Number(left);
    const keyboardY = Number(down) - Number(up);

    if (keyboardX || keyboardY) {
      this.cancelMove();
      this.moveByKeyboard(keyboardX, keyboardY);
    } else if (this.moveTarget) {
      this.moveTowardTarget();
    } else {
      this.sprite.setVelocity(0);
    }

    this.updateAnimation();
    this.updateShadow();
  }

  moveByKeyboard(x, y) {
    const length = Math.hypot(x, y) || 1;
    this.sprite.setVelocity(
      (x / length) * this.moveSpeed,
      (y / length) * this.moveSpeed
    );
  }

  moveTowardTarget() {
    const deltaX = this.moveTarget.x - this.sprite.x;
    const deltaY = this.moveTarget.y - this.sprite.y;
    const distance = Math.hypot(deltaX, deltaY);
    const arrivalDistance = Math.max(this.arrivalRadius, this.moveSpeed / 60 * 1.5);

    if (distance <= arrivalDistance) {
      this.sprite.setPosition(this.moveTarget.x, this.moveTarget.y);
      this.sprite.setVelocity(0);
      this.cancelMove();
      return;
    }

    const velocityX = (deltaX / distance) * this.moveSpeed;
    const velocityY = (deltaY / distance) * this.moveSpeed;
    this.sprite.setVelocity(velocityX, velocityY);
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
    this.sprite.setTexture(`farmer-${this.lastDirection}-0`);
  }

  updateShadow() {
    const textureWidth = this.sprite.displayWidth / Math.abs(this.sprite.scaleX || 1);
    const centerX = this.sprite.x - textureWidth * this.sprite.scaleX * this.shadowOffsetX;
    this.shadow
      .setPosition(centerX, this.sprite.y + 5)
      .setScale(
        Math.abs(this.sprite.scaleX) / this.baseScaleX,
        Math.abs(this.sprite.scaleY) / this.baseScaleY
      )
      .setVisible(this.sprite.visible);
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
      scaleX: this.baseScaleX * 1.08,
      scaleY: this.baseScaleY * .92,
      duration: 125,
      yoyo: true,
      repeat: 1
    });
    this.actionUntil = this.scene.time.now + duration;
  }

  startWaterCollection(duration, targetX, targetY) {
    this.cancelMove();
    this.sprite.setVelocity(0);
    this.lastDirection = targetX < this.sprite.x ? "left" : "right";
    if (Math.abs(targetY - this.sprite.y) > Math.abs(targetX - this.sprite.x)) {
      this.lastDirection = targetY < this.sprite.y ? "up" : "down";
    }
    this.setIdleFrame();
    this.scene.tweens.killTweensOf(this.sprite);
    this.waterCollectionTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScaleX * 1.035,
      scaleY: this.baseScaleY * .965,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    this.actionUntil = this.scene.time.now + Math.max(0, duration);
  }

  stopWaterCollection() {
    this.waterCollectionTween?.stop();
    this.waterCollectionTween = null;
    this.actionUntil = 0;
    this.sprite.setVelocity(0);
    this.sprite.setScale(this.baseScaleX, this.baseScaleY);
    this.setIdleFrame();
    this.updateShadow();
  }

  moveTo(x, y) {
    if (this.scene.time.now < this.actionUntil) return;
    const bounds = this.scene.physics.world.bounds;
    const resolvedTarget = this.scene.resolveMoveTarget?.(x, y);
    const targetX = resolvedTarget?.x
      ?? Phaser.Math.Clamp(x, bounds.left + 16, bounds.right - 16);
    const targetY = resolvedTarget?.y
      ?? Phaser.Math.Clamp(y, bounds.top + 16, bounds.bottom - 16);

    this.moveTarget = {
      x: targetX,
      y: targetY
    };
    this.showMoveMarker(targetX, targetY);
  }

  cancelMove() {
    this.moveTarget = null;
    this.marker.setVisible(false);
  }
}
