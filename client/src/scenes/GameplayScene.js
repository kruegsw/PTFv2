// ============================================================
// PTFv2 Gameplay Scene
// Renders the game world, handles input, syncs with server.
// ============================================================
import Phaser from "phaser";
import { NetworkClient } from "../net/NetworkClient.js";
import { GAME_CONFIG } from "@ptfv2/shared";

export class GameplayScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameplayScene" });
    this.net = null;
    this.myId = null;
    this.playerSprites = new Map();
    this.playerLabels = new Map();
    this.statusText = null;
    this.lastDx = 0;
    this.lastDy = 0;
  }

  create() {
    const { WORLD_WIDTH, WORLD_HEIGHT } = GAME_CONFIG;

    // ── Background grid ──
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x333355, 0.3);
    const gridSize = 64;
    for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
      grid.lineBetween(x, 0, x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
      grid.lineBetween(0, y, WORLD_WIDTH, y);
    }

    // ── World border ──
    const border = this.add.rectangle(
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2,
      WORLD_WIDTH, WORLD_HEIGHT
    );
    border.setStrokeStyle(2, 0x4444aa);

    // ── Camera ──
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // ── Input ──
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── Status text (fixed to camera) ──
    this.statusText = this.add.text(10, 10, "Connecting...", {
      fontSize: "16px",
      color: "#aaaacc",
      fontFamily: "monospace",
    }).setScrollFactor(0).setDepth(100);

    // ── Network ──
    this.net = new NetworkClient((msg) => this.handleServerMessage(msg));
    this.net.connect();
  }

  update(_time, _delta) {
    // ── Read input ──
    const left = this.cursors.left.isDown || this.wasd.a.isDown;
    const right = this.cursors.right.isDown || this.wasd.d.isDown;
    const up = this.cursors.up.isDown || this.wasd.w.isDown;
    const down = this.cursors.down.isDown || this.wasd.s.isDown;

    let dx = 0;
    let dy = 0;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    // Only send when input changes
    if (dx !== this.lastDx || dy !== this.lastDy) {
      this.lastDx = dx;
      this.lastDy = dy;
      this.net.send({ type: "intent_move", dx, dy });
    }

    // ── Update status ──
    const status = this.net.connected
      ? `Connected as ${this.myId || "..."} | Players: ${this.playerSprites.size} | WASD/Arrows to move`
      : "Connecting...";
    this.statusText.setText(status);
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case "welcome":
        this.myId = msg.playerId;
        this.addPlayer(msg.playerId, msg.x, msg.y, true);
        console.log(`[game] Welcome! You are ${msg.playerId} at (${msg.x}, ${msg.y})`);
        break;

      case "player_joined":
        this.addPlayer(msg.playerId, msg.x, msg.y, msg.playerId === this.myId);
        break;

      case "player_left":
        this.removePlayer(msg.playerId);
        break;

      case "snapshot":
        for (const [id, pos] of Object.entries(msg.players)) {
          const sprite = this.playerSprites.get(id);
          if (sprite) {
            sprite.setPosition(pos.x, pos.y);
            const label = this.playerLabels.get(id);
            if (label) {
              label.setPosition(pos.x, pos.y - GAME_CONFIG.PLAYER_SIZE);
            }
          } else {
            this.addPlayer(id, pos.x, pos.y, id === this.myId);
          }

          // Follow our own player with the camera
          if (id === this.myId) {
            this.cameras.main.centerOn(pos.x, pos.y);
          }
        }
        break;
    }
  }

  addPlayer(id, x, y, isMe) {
    if (this.playerSprites.has(id)) return;

    const size = GAME_CONFIG.PLAYER_SIZE;
    const color = isMe ? 0x44bbff : 0xff6644;
    const rect = this.add.rectangle(x, y, size, size, color);
    rect.setDepth(10);
    this.playerSprites.set(id, rect);

    const label = this.add.text(x, y - size, isMe ? "YOU" : id, {
      fontSize: "12px",
      color: isMe ? "#44bbff" : "#ff6644",
      fontFamily: "monospace",
    }).setOrigin(0.5).setDepth(10);
    this.playerLabels.set(id, label);

    if (isMe) {
      this.cameras.main.centerOn(x, y);
    }
  }

  removePlayer(id) {
    const sprite = this.playerSprites.get(id);
    if (sprite) {
      sprite.destroy();
      this.playerSprites.delete(id);
    }
    const label = this.playerLabels.get(id);
    if (label) {
      label.destroy();
      this.playerLabels.delete(id);
    }
  }
}
