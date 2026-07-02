export default class QuestSystem {
  constructor() {
    this.harvested = 0;
  }

  recordHarvest() {
    this.harvested += 1;
    const target = document.querySelector("#quest-list");
    const progress = document.querySelector("#quest-progress");
    if (!target) return;
    target.textContent = this.harvested >= 3
      ? "Hoàn thành! Nhận thưởng 🎉"
      : `${this.harvested}/3 hoàn thành`;
    if (progress) progress.style.width = `${Math.min(100, this.harvested / 3 * 100)}%`;
  }
}
