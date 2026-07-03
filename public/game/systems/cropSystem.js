export default class CropSystem {
  constructor(scene, inventory, quests) {
    this.scene = scene;
    this.inventory = inventory;
    this.quests = quests;
    this.plots = [];
    this.lockedPlots = [];
    this.savedPlots = new Map();
    this.unlockedPlots = new Set();
    this.landUnlockCost = 50;
    this.layout = {
      rows: 4,
      cols: 5,
      plotWidth: 62,
      plotHeight: 55,
      plotSpacingX: 70,
      plotSpacingY: 58,
      gridStartX: 480 - 70 * 2,
      gridStartY: 256
    };
    this.seedPopup = null;
    this.confirmPopup = null;
    this.inventoryCounts = new Map();
    this.seedOptions = [
      { seed: "carrot_seed", crop: "carrot", name: "Hạt cà rốt", icon: "🌱", cropName: "cà rốt" },
      { seed: "corn_seed", crop: "corn", name: "Hạt ngô", icon: "🌽", cropName: "ngô", locked: true },
      { seed: "tomato_seed", crop: "tomato", name: "Hạt cà chua", icon: "🍅", cropName: "cà chua", locked: true }
    ];
  }

  async load() {
    const state = await this.inventory.fetchState();
    this.savedPlots = new Map(state.plots.map((plot) => [plot.plot_id, plot]));
    this.unlockedPlots = new Set(state.unlockedPlots || [0, 1, 2, 3, 4]);
    this.inventoryCounts = new Map(state.inventory.map((item) => [item.item, item.quantity]));

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
    const plot = { id, image, crop: null, plantedAt: null, label: null, busy: false };

    image.on("pointerover", () => image.setDisplaySize(plotWidth + 4, plotHeight + 4).setTint(0xfff0b8));
    image.on("pointerout", () => image.setDisplaySize(plotWidth, plotHeight).clearTint());
    image.on("pointerdown", (pointer) => {
      if (pointer.leftButtonDown()) this.interact(plot);
    });

    this.plots.push(plot);
    if (this.savedPlots.has(id)) {
      const savedPlot = this.savedPlots.get(id);
      this.showCrop(plot, savedPlot.planted_at, savedPlot.crop);
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
    const flag = this.scene.add.image(x + 3, y - 8, "lock-flag")
      .setDisplaySize(34, 43)
      .setDepth(12 + row * .01)
      .setTint(0xd8e0ff)
      .setInteractive({ useHandCursor: true });

    const confirm = (pointer) => {
      pointer.event.stopPropagation();
      this.showUnlockConfirm(plotId, row, col);
    };
    soil.on("pointerover", () => soil.setTint(0x6c543c).setAlpha(.9));
    soil.on("pointerout", () => soil.setTint(0x5c4934).setAlpha(.82));
    soil.on("pointerdown", confirm);
    flag.on("pointerdown", confirm);

    this.lockedPlots[plotId] = { soil, flag };
  }

  async interact(plot) {
    if (plot.busy) return;

    const distance = Phaser.Math.Distance.Between(
      this.scene.player.sprite.x, this.scene.player.sprite.y, plot.image.x, plot.image.y
    );
    if (distance > 165) return this.toast("Hãy lại gần ô đất nhé!");

    plot.busy = true;
    try {
      if (!plot.crop) {
        try {
          await this.refreshInventoryCounts();
        } catch {
          this.toast("Không thể tải hạt giống.");
          return;
        }
        this.showSeedPopup(plot);
        return;
      }

      if (Date.now() - plot.plantedAt < 10000) {
        this.toast(`${plot.cropName || "Cây trồng"} vẫn đang lớn.`);
        return;
      }

      const result = await this.inventory.request(`/api/game/plots/${plot.id}/harvest`);
      if (result.ok) {
        this.scene.player.playAction(plot.image.x, plot.image.y);
        const harvestedCrop = plot.crop;
        const harvestedLabel = plot.label;

        const cropName = plot.cropName || "cây trồng";
        plot.crop = null;
        plot.cropType = null;
        plot.cropName = null;
        plot.label = null;
        plot.plantedAt = null;
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
        this.quests.recordHarvest();
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
    popup.add(this.scene.add.text(0, -33, "Mua ô đất này?", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#fff1b8"
    }).setOrigin(.5));
    popup.add(this.scene.add.text(0, -8, `Giá: 💎 ${this.landUnlockCost}`, {
      fontFamily: "Nunito, sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#ffffff"
    }).setOrigin(.5));

    const cancel = this.createConfirmButton(-50, 31, "Hủy", 0x38453b, () => this.closeConfirmPopup());
    const buy = this.createConfirmButton(52, 31, "Mua", 0x4f7b3f, () => this.unlockLand(plotId, row, col));
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
    this.lockedPlots[plotId]?.flag.destroy();
    this.lockedPlots[plotId] = null;
    this.addPlot(row, col);
    this.changed();
    this.toast(`Đã mua ô đất -${this.landUnlockCost} 💎`, "success");
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
    popup.add(this.scene.add.text(-width / 2 + 14, -height / 2 + 12, "Chọn hạt giống", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#fff1b8"
    }));

    const closeButton = this.scene.add.text(width / 2 - 22, -height / 2 + 9, "×", {
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
      const detail = option.locked ? "Khóa" : `x${count}`;
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

  showCrop(plot, plantedAt, cropType = "carrot") {
    const cropInfo = this.seedOptions.find((option) => option.crop === cropType)
      || { crop: cropType, cropName: cropType };
    plot.plantedAt = Number(plantedAt);
    plot.cropType = cropType;
    plot.cropName = cropInfo.cropName;
    plot.crop = this.scene.add.image(plot.image.x, plot.image.y - 10, "carrot")
      .setScale(.52)
      .setDepth(5)
      .setOrigin(.5, .72);
    plot.label = this.scene.add.text(plot.image.x, plot.image.y + 19, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#fff9d8",
      backgroundColor: "#1a3528c9",
      padding: { x: 5, y: 2 }
    }).setOrigin(.5).setDepth(6);

    this.scene.tweens.add({
      targets: plot.crop,
      scaleX: .57,
      scaleY: .57,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  update() {
    for (const plot of this.plots) {
      if (!plot.crop) continue;
      const left = Math.max(0, 10000 - (Date.now() - plot.plantedAt));
      plot.label.setText(left ? `${Math.ceil(left / 1000)}s` : "THU HOẠCH");
      plot.crop.setTint(left ? 0xc1c99e : 0xffffff);
    }
  }

  changed() {
    document.body.dispatchEvent(new CustomEvent("farm:changed"));
  }

  toast(message = "Có lỗi xảy ra.", type = "error") {
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
