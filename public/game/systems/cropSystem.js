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
    this.cropMaxSize = {
      width: 38,
      height: 43
    };
    // === TỌA ĐỘ CÁC Ô ĐẤT CÓ THỂ CHỈNH TẠI ĐÂY ===
    const debugLayout = scene.farmLayout?.plots || {};
    this.layout = {
      rows: 5,
      cols: 10,
      patchCols: 5,
      plotWidth: debugLayout.plotWidth ?? 44,
      plotHeight: debugLayout.plotHeight ?? 44,
      plotSpacingX: debugLayout.plotSpacingX ?? 62,
      plotSpacingY: debugLayout.plotSpacingY ?? 50,
      patchGapX: debugLayout.patchGapX ?? 142,
      leftPatchOffsetX: debugLayout.leftPatchOffsetX ?? -43,
      rightPatchOffsetX: debugLayout.rightPatchOffsetX ?? 50,
      gridCenterX: (debugLayout.gridCenterX ?? 486) + (scene.mapOffsetX || 0),
      gridStartY: (debugLayout.gridStartY ?? 280) + (scene.mapOffsetY || 0)
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
    this.battleMode = Boolean(window.onlineBattleState?.active);
    const state = this.battleMode
      ? {
          player: { level: 1, xp: 0, water_started_at: null },
          inventory: [
            { item: "carrot_seed", quantity: 3 },
            { item: "water", quantity: 0 }
          ],
          plots: [],
          unlockedPlots: Array.from({ length: 10 }, (_, index) => index)
        }
      : await this.inventory.fetchState();
    this.savedPlots = new Map(state.plots.map((plot) => [plot.plot_id, plot]));
    this.unlockedPlots = new Set(state.unlockedPlots || [0, 1, 2, 3, 4]);
    this.inventoryCounts = new Map(state.inventory.map((item) => [item.item, item.quantity]));
    this.updateSeedLocks(state.player?.level);

    for (let row = 0; row < this.layout.rows; row += 1) {
      for (let col = 0; col < this.layout.cols; col += 1) {
        const plotId = this.getPlotId(row, col);
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

  getPlotId(row, col) {
    return row * this.layout.cols + col;
  }

  getPlotPosition(row, col) {
    const {
      cols,
      patchCols,
      plotSpacingX,
      plotSpacingY,
      patchGapX,
      gridCenterX,
      gridStartY
    } = this.layout;
    const patchIndex = Math.floor(col / patchCols);
    const colInPatch = col % patchCols;
    const patchWidth = (patchCols - 1) * plotSpacingX;
    const totalWidth = patchWidth * 2 + patchGapX;
    const leftPatchStartX = gridCenterX - totalWidth / 2;
    const rightPatchStartX = leftPatchStartX + patchWidth + patchGapX;
    const patchOffsetX = patchIndex === 0 ? this.layout.leftPatchOffsetX : this.layout.rightPatchOffsetX;
    const x = (patchIndex === 0 ? leftPatchStartX : rightPatchStartX) + colInPatch * plotSpacingX + patchOffsetX;
    const y = gridStartY + row * plotSpacingY;

    return { x, y, id: row * cols + col };
  }

  addPlot(row, col) {
    const { plotWidth, plotHeight } = this.layout;
    const { x, y, id } = this.getPlotPosition(row, col);
    const image = this.scene.add.image(x, y, "plot")
      .setDisplaySize(plotWidth, plotHeight)
      .setDepth(3 + row * .01);
    this.scene.setGameInteractive(image);
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

    image.on("pointerover", () => image
      .setTint(0xffffdf)
      .setBlendMode(Phaser.BlendModes.SCREEN));
    image.on("pointerout", () => image
      .clearTint()
      .setBlendMode(Phaser.BlendModes.NORMAL));
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
    const { plotWidth, plotHeight } = this.layout;
    const { x, y, id: plotId } = this.getPlotPosition(row, col);
    const soil = this.scene.add.image(x, y, "plot")
      .setDisplaySize(plotWidth, plotHeight)
      .setDepth(3 + row * .01)
      .setTint(0x8a765c)
      .setAlpha(.95);
    this.scene.setGameInteractive(soil);
    const lockShadow = this.scene.add.image(x, y + 13, "soil-lock-shadow")
      .setDisplaySize(32, 10)
      .setAlpha(.42)
      .setDepth(11 + row * .01);
    const lockIcon = this.scene.add.image(x, y + 1, "soil-lock")
      .setDisplaySize(34, 34)
      .setDepth(12 + row * .01);
    this.scene.setGameInteractive(lockIcon);

    const confirm = (pointer) => {
      if (!pointer.leftButtonDown()) return;
      pointer.event.stopPropagation();
      this.showUnlockConfirm(plotId, row, col);
    };
    const highlightSoil = () => soil
      .setTint(0xffddb0)
      .setAlpha(1)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    const resetSoil = () => soil
      .setTint(0x8a765c)
      .setAlpha(.95)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    soil.on("pointerover", highlightSoil);
    soil.on("pointerout", resetSoil);
    soil.on("pointerdown", confirm);
    lockIcon.on("pointerover", highlightSoil);
    lockIcon.on("pointerout", resetSoil);
    lockIcon.on("pointerdown", confirm);

    this.lockedPlots[plotId] = { soil, lockIcon, lockShadow };
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
        if (!this.battleMode) {
          try {
            await this.refreshInventoryCounts();
          } catch {
            this.toast(this.t("plot.seedLoadFailed"));
            return;
          }
        }
        this.showSeedPopup(plot);
        return;
      }

      if (!plot.wateredAt && Date.now() - plot.plantedAt < this.cropGrowthMs) {
        this.toast(this.t("plot.growing", { crop: plot.cropName || this.t("plot.crop") }));
        return;
      }

      if (!plot.wateredAt) {
        if (this.battleMode) {
          const waterCount = this.inventoryCounts.get("water") || 0;
          if (waterCount < 1) {
            this.toast(this.t("plot.noWater"));
            return;
          }
          plot.wateredAt = Date.now();
          this.inventoryCounts.set("water", waterCount - 1);
          this.scene.player.playAction(plot.image.x, plot.image.y);
          this.toast(this.t("plot.watered"), "success");
          return;
        }

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

      if (this.battleMode) {
        if (Date.now() - plot.wateredAt < this.cropGrowthMs) {
          this.toast(this.t("plot.growing", { crop: plot.cropName || this.t("plot.crop") }));
          return;
        }
        this.harvestBattleCrop(plot);
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
      const result = this.battleMode
        ? {
            ok: option.seed === "carrot_seed"
              && (this.inventoryCounts.get("carrot_seed") || 0) > 0,
            crop: "carrot",
            plantedAt: Date.now()
          }
        : await this.inventory.request(`/api/game/plots/${plot.id}/plant`, {
            seed: option.seed
          });
      if (result.ok) {
        const currentCount = this.inventoryCounts.get(option.seed) || 0;
        this.inventoryCounts.set(option.seed, Math.max(0, currentCount - 1));
        this.scene.player.playAction(plot.image.x, plot.image.y);
        this.showCrop(plot, result.plantedAt, result.crop);
        if (this.battleMode) {
          document.body.dispatchEvent(new CustomEvent("online:carrot-planted", {
            detail: { plotId: plot.id }
          }));
        } else {
          this.changed();
        }
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

  harvestBattleCrop(plot) {
    const harvestedCrop = plot.crop;
    const harvestedLabel = plot.label;
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
    document.body.dispatchEvent(new CustomEvent("online:carrot-harvested", {
      detail: { plotId: plot.id }
    }));
    this.toast("+1 carrot", "success");
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
    const price = document.createElement("p");
    price.className = "game-modal__price";
    price.textContent = this.t("plot.price", { cost: this.landUnlockCost });
    this.confirmPopup = true;
    window.openGameModal({
      title: this.t("plot.buyQuestion"),
      content: price,
      actions: [
        { label: this.t("plot.cancel"), onClick: () => { this.confirmPopup = null; } },
        {
          label: this.t("plot.buy"),
          primary: true,
          onClick: () => this.unlockLand(plotId, row, col)
        }
      ],
      onClose: () => { this.confirmPopup = null; }
    });
  }

  closeConfirmPopup() {
    if (this.confirmPopup) window.closeGameModal?.(false);
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
    this.lockedPlots[plotId]?.lockShadow.destroy();
    this.lockedPlots[plotId] = null;
    this.addPlot(row, col);
    this.changed();
    this.toast(this.t("plot.bought", { cost: this.landUnlockCost }), "success");
  }

  showSeedPopup(plot) {
    this.closeSeedPopup();
    this.closeConfirmPopup();
    const choices = document.createElement("div");
    choices.className = "game-modal__seed-list grid gap-3 p-1";
    this.seedOptions.forEach((option, index) => {
      const count = this.inventoryCounts.get(option.seed) || 0;
      const disabled = option.locked || count <= 0;
      const detail = option.locked
        ? this.t("shop.level", { level: option.unlockLevel })
        : `x${count}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "game-modal__choice flex w-full items-center justify-between rounded-xl border border-[#e8c86655] bg-[linear-gradient(90deg,#17372d,#10291f)] px-3.5 py-2.5 text-left font-extrabold text-[#effaf3] shadow-[inset_0_1px_0_#fff1] transition hover:scale-[1.01] hover:border-[#f8d56baa] hover:brightness-115 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40";
      button.disabled = disabled;
      button.innerHTML = `<span>${option.icon} ${option.name}</span><small>${detail}</small>`;
      button.addEventListener("click", () => this.plant(plot, option));
      choices.appendChild(button);
    });
    this.seedPopup = true;
    window.openGameModal({
      title: this.t("plot.chooseSeed"),
      content: choices,
      onClose: () => { this.seedPopup = null; }
    });
  }

  closeSeedPopup() {
    if (this.seedPopup) window.closeGameModal?.(false);
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
    plot.crop = this.scene.add.image(plot.image.x, plot.image.y + 12, texture)
      .setScale(this.getCropScale(texture, .28))
      .setDepth(5)
      .setOrigin(.5, 1);
    this.scene.setGameInteractive(plot.crop);
    const labelBackground = this.scene.add.graphics();
    const labelText = this.scene.add.text(0, 0, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "8px",
      fontStyle: "bold",
      color: "#fff9d8"
    }).setOrigin(.5).setResolution(2);
    const labelWaterDrop = this.scene.add.image(0, 0, "water-drop")
      .setDisplaySize(14, 14)
      .setVisible(false);
    plot.label = this.scene.add.container(
      plot.image.x,
      plot.image.y + 14,
      [labelBackground, labelText, labelWaterDrop]
    )
      .setSize(18, 18)
      .setDepth(6);
    this.scene.setGameInteractive(plot.label);
    plot.labelBackground = labelBackground;
    plot.labelText = labelText;
    plot.labelWaterDrop = labelWaterDrop;
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
      const matureScale = this.getCropScale(plot.crop.texture.key, 1);
      const growthScale = plot.treatedAt
        ? Phaser.Math.Linear(matureScale * .8, matureScale, Phaser.Math.Easing.Sine.InOut(finalGrowth))
        : (plot.wateredAt
          ? Phaser.Math.Linear(matureScale * .66, matureScale * .8, Phaser.Math.Easing.Sine.InOut(secondGrowth))
          : Phaser.Math.Linear(matureScale * .28, matureScale * .66, Phaser.Math.Easing.Sine.InOut(firstGrowth)));
      plot.crop.setScale(growthScale);
      const needsWater = !plot.wateredAt && firstGrowth === 1;
      const needsPesticide = !this.battleMode
        && Boolean(plot.wateredAt)
        && !plot.treatedAt
        && secondGrowth === 1;
      const ready = this.battleMode
        ? Boolean(plot.wateredAt) && secondGrowth === 1
        : Boolean(plot.treatedAt) && finalGrowth === 1;
      const state = ready
        ? "ready"
        : (needsPesticide ? "pesticide" : (needsWater ? "water" : "growing"));
      const left = plot.treatedAt
        ? Math.max(0, this.cropGrowthMs - (now - plot.treatedAt))
        : (plot.wateredAt
          ? Math.max(0, this.cropGrowthMs - (now - plot.wateredAt))
          : Math.max(0, this.cropGrowthMs - (now - plot.plantedAt)));
      const nextLabel = state === "ready"
        ? "✓"
        : (state === "water"
          ? ""
          : (state === "pesticide" ? "🧴" : String(Math.ceil(left / 1000))));
      if (plot.labelText.text !== nextLabel) plot.labelText.setText(nextLabel);
      if (plot.labelState !== state) {
        plot.labelState = state;
        plot.labelWaterDrop.setVisible(state === "water");
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
        plot.labelBackground.clear();
        if (state !== "water") {
          plot.labelBackground
            .fillStyle(0x315c2f, .98)
            .fillCircle(0, 0, 7)
            .lineStyle(1, 0xe2c86f, 1)
            .strokeCircle(0, 0, 6.5);
        }
      }
      plot.crop.setTint(ready ? 0xffffff : 0xc1c99e);
    }
  }

  getCropScale(textureKey, ratio = 1) {
    const texture = this.scene.textures.get(textureKey);
    const source = texture?.getSourceImage?.();
    const sourceWidth = source?.width || 1;
    const sourceHeight = source?.height || 1;
    const maxScale = Math.min(
      this.cropMaxSize.width / sourceWidth,
      this.cropMaxSize.height / sourceHeight
    );
    return maxScale * ratio;
  }

  applyDebugLayout(nextLayout = {}) {
    const offsetX = this.scene.mapOffsetX || 0;
    const offsetY = this.scene.mapOffsetY || 0;
    Object.assign(this.layout, nextLayout, {
      gridCenterX: (nextLayout.gridCenterX ?? 486) + offsetX,
      gridStartY: (nextLayout.gridStartY ?? 280) + offsetY
    });

    this.plots.forEach((plot) => {
      const row = Math.floor(plot.id / this.layout.cols);
      const col = plot.id % this.layout.cols;
      const { x, y } = this.getPlotPosition(row, col);
      plot.image.setPosition(x, y).setDisplaySize(this.layout.plotWidth, this.layout.plotHeight);
      plot.crop?.setPosition(x, y + 12);
      plot.label?.setPosition(x + 14, y + 8);
    });

    this.lockedPlots.forEach((plot, plotId) => {
      if (!plot) return;
      const row = Math.floor(plotId / this.layout.cols);
      const col = plotId % this.layout.cols;
      const { x, y } = this.getPlotPosition(row, col);
      plot.soil.setPosition(x, y).setDisplaySize(this.layout.plotWidth, this.layout.plotHeight);
      plot.lockIcon?.setPosition(x, y + 1);
      plot.lockShadow?.setPosition(x, y + 13);
    });
  }

  setVisible(visible) {
    const toggle = (object) => {
      object?.setVisible(visible).setActive(visible);
      if (object?.input) object.input.enabled = visible;
    };
    this.plots.forEach((plot) => {
      toggle(plot.image);
      toggle(plot.crop);
      toggle(plot.label);
    });
    this.lockedPlots.forEach((plot) => {
      toggle(plot?.soil);
      toggle(plot?.lockIcon);
      toggle(plot?.lockShadow);
    });
    if (!visible) {
      this.closeSeedPopup();
      this.closeConfirmPopup();
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
