// ============================================================
// PTFv2 Client Entry Point
// Boots Phaser and starts the gameplay scene.
// ============================================================
import Phaser from "phaser";
import { GameplayScene } from "./scenes/GameplayScene.js";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#1a1a2e",
  scene: [GameplayScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
  },
});

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
