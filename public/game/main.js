import PreloadScene from "./scenes/PreloadScene.js";
import FarmScene from "./scenes/FarmScene.js";

const renderResolution = Math.min(2, Math.max(
  window.devicePixelRatio || 1,
  window.innerWidth / 960,
  window.innerHeight / 600
));

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
