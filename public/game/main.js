import PreloadScene from "./scenes/PreloadScene.js";
import FarmScene from "./scenes/FarmScene.js";

const renderResolution = Math.min(
  2,
  Math.max(1, window.devicePixelRatio || 1)
);

function createImmortalCursor() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const stage = document.querySelector(".game-stage");
  if (!stage) return;

  const cursor = document.createElement("div");
  cursor.className = "immortal-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = `
    <span class="immortal-cursor__aura"></span>
    <span class="immortal-cursor__rune"></span>
    <span class="immortal-cursor__orbit immortal-cursor__orbit--outer"></span>
    <span class="immortal-cursor__orbit immortal-cursor__orbit--inner"></span>
    <span class="immortal-cursor__blade"></span>
    <span class="immortal-cursor__spark immortal-cursor__spark--one"></span>
    <span class="immortal-cursor__spark immortal-cursor__spark--two"></span>
    <span class="immortal-cursor__spark immortal-cursor__spark--three"></span>
  `;
  stage.appendChild(cursor);

  let castingTimer;
  let phaserInteractive = false;
  window.setImmortalCursorInteractive = (interactive) => {
    phaserInteractive = Boolean(interactive);
    cursor.classList.toggle("is-interactive", phaserInteractive);
  };

  window.addEventListener("pointermove", (event) => {
    const bounds = stage.getBoundingClientRect();
    const insideStage = event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
    if (!insideStage) {
      cursor.classList.remove("is-visible");
      return;
    }
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const domInteractive = Boolean(event.target.closest?.(
      "button, a, input, select, [role='button']"
    ));
    cursor.classList.toggle("is-interactive", phaserInteractive || domInteractive);
    cursor.classList.add("is-visible");
  });
  stage.addEventListener("pointerdown", () => {
    window.clearTimeout(castingTimer);
    cursor.classList.remove("is-casting");
    void cursor.offsetWidth;
    cursor.classList.add("is-casting");
    castingTimer = window.setTimeout(() => cursor.classList.remove("is-casting"), 320);
  });
  window.addEventListener("blur", () => cursor.classList.remove("is-visible", "is-casting"));
}

function launchGame() {
  window.farmGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-container",
    width: 960,
    height: 600,
    resolution: renderResolution,
    backgroundColor: "#78b159",
    pixelArt: false,
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    fps: {
      target: 120,
      min: 30,
      smoothStep: true,
      forceSetTimeOut: false
    },
    physics: {
      default: "arcade",
      arcade: { debug: false }
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER
    },
    scene: [PreloadScene, FarmScene]
  });
}

(window.farmGameReady || Promise.resolve()).then(launchGame);
createImmortalCursor();
