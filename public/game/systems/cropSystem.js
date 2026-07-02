export default class CropSystem {
  constructor(scene, inventory, quests) {
    this.scene = scene;
    this.inventory = inventory;
    this.quests = quests;
    this.plots = [];
  }

  async load() {
    const state = await this.inventory.fetchState();
    const saved = new Map(state.plots.map((plot) => [plot.plot_id, plot]));

    for (let id = 0; id < 12; id += 1) {
      const col = id % 4;
      const row = Math.floor(id / 4);
      const x = 365 + col * 91;
      const y = 356 + row * 64;
      const image = this.scene.add.image(x, y, "plot")
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      const plot = { id, image, crop: null, plantedAt: null, label: null, busy: false };

      image.on("pointerover", () => image.setScale(1.045).setTint(0xfff4c2));
      image.on("pointerout", () => image.setScale(1).clearTint());
      image.on("pointerdown", (pointer) => {
        if (pointer.leftButtonDown()) this.interact(plot);
      });
      this.plots.push(plot);
      if (saved.has(id)) this.showCrop(plot, saved.get(id).planted_at);
    }
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
        const result = await this.inventory.request(`/api/game/plots/${plot.id}/plant`);
        if (result.ok) {
          this.scene.player.playAction(plot.image.x, plot.image.y);
          this.showCrop(plot, result.plantedAt);
          this.changed();
        } else {
          this.toast(result.error);
        }
        return;
      }

      if (Date.now() - plot.plantedAt < 10000) {
        this.toast("Cà rốt vẫn đang lớn.");
        return;
      }

      const result = await this.inventory.request(`/api/game/plots/${plot.id}/harvest`);
      if (result.ok) {
        this.scene.player.playAction(plot.image.x, plot.image.y);
        const harvestedCrop = plot.crop;
        const harvestedLabel = plot.label;

        plot.crop = null;
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
        this.toast("+1 cà rốt 🥕", "success");
      } else {
        this.toast(result.error);
      }
    } finally {
      plot.busy = false;
    }
  }

  showCrop(plot, plantedAt) {
    plot.plantedAt = Number(plantedAt);
    plot.crop = this.scene.add.image(plot.image.x, plot.image.y - 12, "carrot")
      .setScale(.65)
      .setDepth(5)
      .setOrigin(.5, .72);
    plot.label = this.scene.add.text(plot.image.x, plot.image.y + 20, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#fff9d8",
      backgroundColor: "#1a3528c9",
      padding: { x: 5, y: 2 }
    }).setOrigin(.5).setDepth(6);

    this.scene.tweens.add({
      targets: plot.crop,
      scaleX: .71,
      scaleY: .71,
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
