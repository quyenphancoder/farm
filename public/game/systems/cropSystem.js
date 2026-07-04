export default class CropSystem {
  constructor(scene, inventory) {
    this.scene = scene;
    this.inventory = inventory;
    this.t = (key, values) => window.i18n?.t(key, values) || key;
    this.plots = [];
    this.lockedPlots = [];
    this.savedPlots = new Map();
    this.unlockedPlots = new Set();
    this.landUnlockCost = 50;
    this.cropGrowthMs = 10000;
    this.layout = {
      rows: 5,
      cols: 8,
      plotWidth: 48,
      plotHeight: 40,
      plotSpacingX: 50,
      plotSpacingY: 42,
      gridStartX: 480 + (scene.mapOffsetX || 0) - 50 * 3.5,
      gridStartY: 255 + (scene.mapOffsetY || 0)
    };
    this.seedPopup = null;
    this.confirmPopup = null;
    this.inventoryCounts = new Map();
    this.currentLevel = 1;
    this.seedOptions = [
      { seed: "carrot_seed", crop: "carrot", name: this.t("item.carrotSeed"), icon: "🌱", cropName: this.t("item.carrotLower") },
      { seed: "corn_seed", crop: "corn", name: this.t("item.cornSeed"), icon: "🌽", cropName: this.t("item.cornLower"), unlockLevel: 2, locked: true },
      { seed: "tomato_seed", crop: "tomato", name: this.t("item.tomatoSeed"), icon: "🍅", cropName: this.t("item.tomatoLower"), unlockLevel: 5, locked: true }
    ];
  }

  async load() {
    const state = await this.inventory.fetchState();
    this.savedPlots = new Map(state.plots.map((plot) => [plot.plot_id, plot]));
    this.unlockedPlots = new Set(state.unlockedPlots || [0, 1, 2, 3, 4]);
    this.inventoryCounts = new Map(state.inventory.map((item) => [item.item, item.quantity]));
    this.updateSeedLocks(state.player?.level);

    for (let row = 0; row < this.layout.rows; row += 1) {
      for (let col = 0; col < this.layout.cols; col += 1) {
        const plotId = row * this.layout.cols + col;
        if (this.unlockedPlots.has(plotId)) {
          this.addPlot(row, col);
        } else {
          this.addLockedPlot(row, col);
        }
      }
    }
    return state;
  }

  addPlotRow(row) {
    for (let col = 0; col < this.layout.cols; col += 1) this.addPlot(row, col);
  }

  addPlot(row, col) {
    const { plotWidth, plotHeight, plotSpacingX, plotSpacingY, gridStartX, gridStartY } = this.layout;
    const id = row * this.layout.cols + col;
    const x = gridStartX + col * plotSpacingX;
    const y = gridStartY + row * plotSpacingY;
    const image = this.scene.add.image(x, y, "plot")
      .setDisplaySize(plotWidth, plotHeight)
      .setDepth(3 + row * .01)
      .setInteractive({ useHandCursor: true });
    const plot = {
      id,
      image,
      crop: null,
      plantedAt: null,
      wateredAt: null,
      treatedAt: null,
      label: null,
      busy: false
    };

    image.on("pointerover", () => image.setDisplaySize(plotWidth + 4, plotHeight + 4).setTint(0xfff0b8));
    image.on("pointerout", () => image.setDisplaySize(plotWidth, plotHeight).clearTint());
    image.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown()) return;
      pointer.event.stopPropagation();
      this.interact(plot);
    });

    this.plots.push(plot);
    if (this.savedPlots.has(id)) {
      const savedPlot = this.savedPlots.get(id);
      this.showCrop(
        plot,
        savedPlot.planted_at,
        savedPlot.crop,
        savedPlot.watered_at,
        savedPlot.treated_at
      );
    }
  }

  addLockedPlot(row, col) {
    const { plotWidth, plotHeight, plotSpacingX, plotSpacingY, gridStartX, gridStartY } = this.layout;
    const plotId = row * this.layout.cols + col;
    const x = gridStartX + col * plotSpacingX;
    const y = gridStartY + row * plotSpacingY;
    const soil = this.scene.add.image(x, y, "plot")
      .setDisplaySize(plotWidth, plotHeight)
      .setDepth(3 + row * .01)
      .setTint(0x5c4934)
      .setAlpha(.82)
      .setInteractive({ useHandCursor: true });
    const lockIcon = this.scene.add.text(x, y - 2, "🔒", {
      fontFamily: "Arial, sans-serif",
      fontSize: "20px"
    })
      .setOrigin(.5)
      .setDepth(12 + row * .01)
      .setShadow(0, 2, "#00000099", 2)
      .setInteractive({ useHandCursor: true });

    const confirm = (pointer) => {
      if (!pointer.leftButtonDown()) return;
      pointer.event.stopPropagation();
      this.showUnlockConfirm(plotId, row, col);
    };
    soil.on("pointerover", () => soil.setTint(0x6c543c).setAlpha(.9));
    soil.on("pointerout", () => soil.setTint(0x5c4934).setAlpha(.82));
    soil.on("pointerdown", confirm);
    lockIcon.on("pointerdown", confirm);

    this.lockedPlots[plotId] = { soil, lockIcon };
  }

  async interact(plot) {
    if (plot.busy) return;

    const distance = Phaser.Math.Distance.Between(
      this.scene.player.sprite.x, this.scene.player.sprite.y, plot.image.x, plot.image.y
    );
    if (distance > 165) return this.toast(this.t("plot.comeCloser"));

    plot.busy = true;
    try {
      if (!plot.crop) {
        try {
          await this.refreshInventoryCounts();
        } catch {
          this.toast(this.t("plot.seedLoadFailed"));
          return;
        }
        this.showSeedPopup(plot);
        return;
      }

      if (!plot.wateredAt && Date.now() - plot.plantedAt < this.cropGrowthMs) {
        this.toast(this.t("plot.growing", { crop: plot.cropName || this.t("plot.crop") }));
        return;
      }

      if (!plot.wateredAt) {
        const result = await this.inventory.request(`/api/game/plots/${plot.id}/water`);
        if (result.ok) {
          plot.wateredAt = Number(result.wateredAt);
          const waterCount = this.inventoryCounts.get("water") || 0;
          this.inventoryCounts.set("water", Math.max(0, waterCount - 1));
          this.scene.player.playAction(plot.image.x, plot.image.y);
          this.changed();
          this.toast(this.t("plot.watered"), "success");
        } else {
          this.toast(result.error);
        }
        return;
      }

      if (!plot.treatedAt) {
        if (Date.now() - plot.wateredAt < this.cropGrowthMs) {
          this.toast(this.t("plot.growing", { crop: plot.cropName || this.t("plot.crop") }));
          return;
        }
        const result = await this.inventory.request(`/api/game/plots/${plot.id}/pesticide`);
        if (result.ok) {
          plot.treatedAt = Number(result.treatedAt);
          const pesticideCount = this.inventoryCounts.get("pesticide") || 0;
          this.inventoryCounts.set("pesticide", Math.max(0, pesticideCount - 1));
          this.scene.player.playAction(plot.image.x, plot.image.y);
          this.changed();
          this.toast(this.t("plot.treated"), "success");
        } else {
          this.toast(result.error);
        }
        return;
      }

      if (Date.now() - plot.treatedAt < this.cropGrowthMs) {
        this.toast(this.t("plot.growing", { crop: plot.cropName || this.t("plot.crop") }));
        return;
      }

      const result = await this.inventory.request(`/api/game/plots/${plot.id}/harvest`);
      if (result.ok) {
        this.scene.player.playAction(plot.image.x, plot.image.y);
        const harvestedCrop = plot.crop;
        const harvestedLabel = plot.label;

        const cropName = plot.cropName || this.t("plot.crop");
        plot.crop = null;
        plot.cropType = null;
        plot.cropName = null;
        plot.label = null;
        plot.plantedAt = null;
        plot.wateredAt = null;
        plot.treatedAt = null;
        harvestedLabel?.destroy();
        this.scene.tweens.killTweensOf(harvestedCrop);
        this.scene.tweens.add({
          targets: harvestedCrop,
          y: harvestedCrop.y - 25,
          scaleX: .85,
          scaleY: .85,
          alpha: 0,
          duration: 260,
          onComplete: () => harvestedCrop.destroy()
        });
        document.body.dispatchEvent(new CustomEvent("farm:progress", {
          detail: { level: result.level, xp: result.xp }
        }));
        this.updateSeedLocks(result.level);
        this.changed();
        this.toast(`+1 ${cropName}`, "success");
      } else {
        this.toast(result.error);
      }
    } finally {
      plot.busy = false;
    }
  }

  async plant(plot, option) {
    if (plot.busy) return;
    this.closeSeedPopup();
    plot.busy = true;
    try {
      const result = await this.inventory.request(`/api/game/plots/${plot.id}/plant`, {
        seed: option.seed
      });
      if (result.ok) {
        const currentCount = this.inventoryCounts.get(option.seed) || 0;
        this.inventoryCounts.set(option.seed, Math.max(0, currentCount - 1));
        this.scene.player.playAction(plot.image.x, plot.image.y);
        this.showCrop(plot, result.plantedAt, result.crop);
        this.changed();
      } else {
        this.toast(result.error);
      }
    } finally {
      plot.busy = false;
    }
  }

  async refreshInventoryCounts() {
    const state = await this.inventory.fetchState();
    this.inventoryCounts = new Map(state.inventory.map((item) => [item.item, item.quantity]));
    this.updateSeedLocks(state.player?.level);
  }

  updateSeedLocks(level = 1) {
    this.currentLevel = Math.max(1, Number(level) || 1);
    for (const option of this.seedOptions) {
      option.locked = Boolean(option.unlockLevel && this.currentLevel < option.unlockLevel);
    }
  }

  showUnlockConfirm(plotId, row, col) {
    this.closeSeedPopup();
    this.closeConfirmPopup();

    const { plotSpacingX, plotSpacingY, gridStartX, gridStartY } = this.layout;
    const width = 232;
    const height = 112;
    const x = Phaser.Math.Clamp(gridStartX + col * plotSpacingX, width / 2 + 12, 960 - width / 2 - 12);
    const y = Phaser.Math.Clamp(gridStartY + row * plotSpacingY - 80, height / 2 + 12, 600 - height / 2 - 12);
    const popup = this.scene.add.container(x, y).setDepth(110);
    const graphics = this.scene.add.graphics();
    const blocker = this.scene.add.zone(0, 0, width, height).setOrigin(.5).setInteractive();

    blocker.on("pointerdown", (pointer) => pointer.event.stopPropagation());
    graphics.fillStyle(0x101c16, 1).fillRoundedRect(-width / 2, -height / 2, width, height, 14);
    graphics.lineStyle(3, 0xffe08a, .95).strokeRoundedRect(-width / 2, -height / 2, width, height, 14);
    popup.add([blocker, graphics]);
    popup.add(this.scene.add.text(0, -33, this.t("plot.buyQuestion"), {
      fontFamily: "Nunito, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#fff1b8"
    }).setOrigin(.5));
    popup.add(this.scene.add.text(0, -8, this.t("plot.price", { cost: this.landUnlockCost }), {
      fontFamily: "Nunito, sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#ffffff"
    }).setOrigin(.5));

    const cancel = this.createConfirmButton(-50, 31, this.t("plot.cancel"), 0x38453b, () => this.closeConfirmPopup());
    const buy = this.createConfirmButton(52, 31, this.t("plot.buy"), 0x4f7b3f, () => this.unlockLand(plotId, row, col));
    popup.add([cancel, buy]);
    this.confirmPopup = popup;
  }

  createConfirmButton(x, y, label, color, onClick) {
    const button = this.scene.add.container(x, y);
    const bg = this.scene.add.rectangle(0, 0, 82, 28, color, 1)
      .setStrokeStyle(1, 0xffe08a, .55)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add.text(0, 0, label, {
      fontFamily: "Nunito, sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#ffffff"
    }).setOrigin(.5);

    bg.on("pointerover", () => bg.setFillStyle(color + 0x101010, 1));
    bg.on("pointerout", () => bg.setFillStyle(color, 1));
    bg.on("pointerdown", (pointer) => {
      pointer.event.stopPropagation();
      onClick();
    });
    button.add([bg, text]);
    return button;
  }

  closeConfirmPopup() {
    this.confirmPopup?.destroy(true);
    this.confirmPopup = null;
  }

  async unlockLand(plotId, row, col) {
    this.closeConfirmPopup();
    const result = await this.inventory.request("/api/game/land/unlock", { plotId });
    if (!result.ok) {
      this.toast(result.error);
      return;
    }

    this.unlockedPlots.add(plotId);
    this.lockedPlots[plotId]?.soil.destroy();
    this.lockedPlots[plotId]?.lockIcon.destroy();
    this.lockedPlots[plotId] = null;
    this.addPlot(row, col);
    this.changed();
    this.toast(this.t("plot.bought", { cost: this.landUnlockCost }), "success");
  }

  showSeedPopup(plot) {
    this.closeSeedPopup();
    this.closeConfirmPopup();

    const width = 238;
    const rowHeight = 34;
    const height = 52 + this.seedOptions.length * rowHeight;
    const x = Phaser.Math.Clamp(plot.image.x, width / 2 + 12, 960 - width / 2 - 12);
    const y = Phaser.Math.Clamp(plot.image.y - 112, height / 2 + 12, 600 - height / 2 - 12);
    const popup = this.scene.add.container(x, y).setDepth(100);
    const graphics = this.scene.add.graphics();

    const blocker = this.scene.add.zone(0, 0, width, height)
      .setOrigin(.5)
      .setInteractive();
    blocker.on("pointerdown", (pointer) => pointer.event.stopPropagation());
    popup.add(blocker);

    graphics.fillStyle(0x101c16, 1).fillRoundedRect(-width / 2, -height / 2, width, height, 14);
    graphics.lineStyle(3, 0xffe08a, .95).strokeRoundedRect(-width / 2, -height / 2, width, height, 14);
    popup.add(graphics);
    const titleY = -height / 2 + 20;
    popup.add(this.scene.add.text(-width / 2 + 14, titleY, this.t("plot.chooseSeed"), {
      fontFamily: "Nunito, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#fff1b8"
    }).setOrigin(0, .5));

    const closeButton = this.scene.add.text(width / 2 - 22, titleY - 4, "×", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#ffe2a0"
    }).setOrigin(.5).setInteractive({ useHandCursor: true });
    closeButton.on("pointerdown", (pointer) => {
      pointer.event.stopPropagation();
      this.closeSeedPopup();
    });
    popup.add(closeButton);

    this.seedOptions.forEach((option, index) => {
      const count = this.inventoryCounts.get(option.seed) || 0;
      const disabled = option.locked || count <= 0;
      const rowY = -height / 2 + 46 + index * rowHeight;
      const row = this.scene.add.rectangle(0, rowY, width - 24, 28, disabled ? 0x263229 : 0x3f6b44, 1)
        .setStrokeStyle(1, disabled ? 0x65735f : 0xd2ff87, disabled ? .45 : .95);
      const label = `${option.icon} ${option.name}`;
      const detail = option.locked
        ? this.t("shop.level", { level: option.unlockLevel })
        : `x${count}`;
      const nameText = this.scene.add.text(-width / 2 + 22, rowY, label, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        color: disabled ? "#9fa99b" : "#ffffff"
      }).setOrigin(0, .5);
      const countText = this.scene.add.text(width / 2 - 24, rowY, detail, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: disabled ? "#adb5a5" : "#ffe27b"
      }).setOrigin(1, .5);

      popup.add([row, nameText, countText]);
      if (!disabled) {
        row.setInteractive({ useHandCursor: true });
        row.on("pointerover", () => row.setFillStyle(0x568a4d, 1));
        row.on("pointerout", () => row.setFillStyle(0x3f6b44, 1));
        row.on("pointerdown", (pointer) => {
          pointer.event.stopPropagation();
          this.plant(plot, option);
        });
      }
    });

    this.seedPopup = popup;
  }

  closeSeedPopup() {
    this.seedPopup?.destroy(true);
    this.seedPopup = null;
  }

  showCrop(plot, plantedAt, cropType = "carrot", wateredAt = null, treatedAt = null) {
    const cropInfo = this.seedOptions.find((option) => option.crop === cropType)
      || { crop: cropType, cropName: cropType };
    plot.plantedAt = Number(plantedAt);
    plot.wateredAt = wateredAt ? Number(wateredAt) : null;
    plot.treatedAt = treatedAt ? Number(treatedAt) : null;
    plot.cropType = cropType;
    plot.cropName = cropInfo.cropName;
    const texture = this.scene.textures.exists(cropType) ? cropType : "carrot";
    plot.crop = this.scene.add.image(plot.image.x, plot.image.y - 2, texture)
      .setScale(.04)
      .setDepth(5)
      .setOrigin(.5)
      .setInteractive({ useHandCursor: true });
    const labelBackground = this.scene.add.graphics();
    const labelText = this.scene.add.text(0, 0, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      color: "#fff9d8"
    }).setOrigin(.5).setResolution(2);
    plot.label = this.scene.add.container(
      plot.image.x,
      plot.image.y + 14,
      [labelBackground, labelText]
    )
      .setSize(18, 18)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });
    plot.labelBackground = labelBackground;
    plot.labelText = labelText;
    plot.labelState = null;
    const interactWithCrop = (pointer) => {
      if (!pointer.leftButtonDown()) return;
      pointer.event.stopPropagation();
      this.interact(plot);
    };
    plot.crop.on("pointerdown", interactWithCrop);
    plot.label.on("pointerdown", interactWithCrop);
  }

  update() {
    for (const plot of this.plots) {
      if (!plot.crop) continue;
      const now = Date.now();
      const firstGrowth = Phaser.Math.Clamp(
        (now - plot.plantedAt) / this.cropGrowthMs,
        0,
        1
      );
      const secondGrowth = plot.wateredAt
        ? Phaser.Math.Clamp((now - plot.wateredAt) / this.cropGrowthMs, 0, 1)
        : 0;
      const finalGrowth = plot.treatedAt
        ? Phaser.Math.Clamp((now - plot.treatedAt) / this.cropGrowthMs, 0, 1)
        : 0;
      const growthScale = plot.treatedAt
        ? Phaser.Math.Linear(.12, .15, Phaser.Math.Easing.Sine.InOut(finalGrowth))
        : (plot.wateredAt
          ? Phaser.Math.Linear(.1, .12, Phaser.Math.Easing.Sine.InOut(secondGrowth))
          : Phaser.Math.Linear(.04, .1, Phaser.Math.Easing.Sine.InOut(firstGrowth)));
      plot.crop.setScale(growthScale);
      const needsWater = !plot.wateredAt && firstGrowth === 1;
      const needsPesticide = Boolean(plot.wateredAt) && !plot.treatedAt && secondGrowth === 1;
      const ready = Boolean(plot.treatedAt) && finalGrowth === 1;
      const state = ready
        ? "ready"
        : (needsPesticide ? "pesticide" : (needsWater ? "water" : "growing"));
      const left = plot.treatedAt
        ? Math.max(0, this.cropGrowthMs - (now - plot.treatedAt))
        : (plot.wateredAt
          ? Math.max(0, this.cropGrowthMs - (now - plot.wateredAt))
          : Math.max(0, this.cropGrowthMs - (now - plot.plantedAt)));
      plot.labelText.setText(
        state === "ready"
          ? "✓"
          : (state === "water"
            ? "💧"
            : (state === "pesticide" ? "🧴" : String(Math.ceil(left / 1000))))
      );
      if (plot.labelState !== state) {
        plot.labelState = state;
        plot.label.setPosition(
          plot.image.x + 14,
          plot.image.y + 8
        );
        plot.labelText
          .setX(state === "water" || state === "pesticide" ? 1 : 0)
          .setOrigin(state === "water" || state === "pesticide" ? .555 : .5, .5)
          .setFontSize(
            state === "water" || state === "pesticide" ? "9px" : (ready ? "8px" : "6px")
          )
          .setColor(ready ? "#fff0a6" : "#ffffff")
          .setStroke("#315c2f", 0);
        plot.labelBackground
          .clear()
          .fillStyle(0x315c2f, .98)
          .fillCircle(0, 0, 7)
          .lineStyle(1, 0xe2c86f, 1)
          .strokeCircle(0, 0, 6.5);
      }
      plot.crop.setTint(ready ? 0xffffff : 0xc1c99e);
    }
  }

  changed() {
    document.body.dispatchEvent(new CustomEvent("farm:changed"));
  }

  toast(message = this.t("game.genericError"), type = "error") {
    const color = type === "success" ? "#327a3dcc" : "#74352acc";
    const text = this.scene.add.text(500, 285, message, {
      fontFamily: "Nunito, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#fff",
      backgroundColor: color,
      padding: { x: 14, y: 9 }
    }).setOrigin(.5).setDepth(30);

    this.scene.tweens.add({
      targets: text,
      y: 265,
      alpha: 0,
      delay: 950,
      duration: 350,
      onComplete: () => text.destroy()
    });
  }
}
