// ============================================================
// PTFv2 Server
// - WebSocket game server (authoritative movement)
// - In production: also serves the built client files
// ============================================================
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { GAME_CONFIG } from "@ptfv2/shared";

const PORT = Number(process.env.PORT) || 8080;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Player State ──────────────────────────────────────────────
const players = new Map();
let nextId = 1;

// ── HTTP Server ───────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  const clientDist = join(__dirname, "..", "..", "client", "dist");

  if (!existsSync(clientDist)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html><body style="font-family: sans-serif; padding: 2rem;">
        <h2>PTFv2 Server Running</h2>
        <p>WebSocket server is active on port ${PORT}.</p>
        <p>To play: run <code>npm run dev</code> from the project root.</p>
        <p>Or run <code>npm run build</code> then <code>npm start</code> to serve everything from here.</p>
      </body></html>
    `);
    return;
  }

  // Serve static files from client/dist
  serveStatic(req, res, clientDist);
});

// Simple static file server (no Express dependency needed)
function serveStatic(req, res, baseDir) {
  const url = req.url === "/" ? "/index.html" : req.url;
  const filePath = join(baseDir, url);

  // Security: don't allow path traversal
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  import("node:fs").then(({ default: fs }) => {
    if (!fs.existsSync(filePath)) {
      // SPA fallback: serve index.html for unknown routes
      const indexPath = join(baseDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        fs.createReadStream(indexPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
      return;
    }

    const ext = filePath.split(".").pop();
    const mimeTypes = {
      html: "text/html",
      js: "application/javascript",
      css: "text/css",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      svg: "image/svg+xml",
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ── WebSocket Server ──────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  const playerId = `p${nextId++}`;

  // Spawn at random position within world bounds
  const margin = GAME_CONFIG.PLAYER_SIZE * 2;
  const x = margin + Math.random() * (GAME_CONFIG.WORLD_WIDTH - margin * 2);
  const y = margin + Math.random() * (GAME_CONFIG.WORLD_HEIGHT - margin * 2);

  const player = { id: playerId, x, y, dx: 0, dy: 0, socket };
  players.set(playerId, player);

  // Send welcome to the new player
  send(socket, {
    type: "welcome",
    playerId,
    x: Math.round(x),
    y: Math.round(y),
  });

  // Tell everyone else about the new player
  broadcast({
    type: "player_joined",
    playerId,
    x: Math.round(x),
    y: Math.round(y),
  }, playerId);

  // Tell the new player about existing players
  for (const [id, p] of players) {
    if (id !== playerId) {
      send(socket, {
        type: "player_joined",
        playerId: id,
        x: Math.round(p.x),
        y: Math.round(p.y),
      });
    }
  }

  // Handle messages from this player
  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "intent_move") {
        // Clamp to -1, 0, 1
        player.dx = Math.max(-1, Math.min(1, msg.dx));
        player.dy = Math.max(-1, Math.min(1, msg.dy));
      }
    } catch {
      // Ignore malformed messages
    }
  });

  // Handle disconnect
  const cleanup = () => {
    players.delete(playerId);
    broadcast({ type: "player_left", playerId });
    console.log(`[-] ${playerId} disconnected (${players.size} players)`);
  };
  socket.on("close", cleanup);
  socket.on("error", cleanup);

  console.log(`[+] ${playerId} connected (${players.size} players)`);
});

// ── Game Loop ─────────────────────────────────────────────────
const SIM_INTERVAL = 1000 / GAME_CONFIG.TICK_RATE;
const NET_INTERVAL = 1000 / GAME_CONFIG.NET_RATE;

function simTick() {
  const dt = SIM_INTERVAL / 1000;
  const speed = GAME_CONFIG.MOVE_SPEED;
  const { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SIZE } = GAME_CONFIG;

  for (const player of players.values()) {
    if (player.dx === 0 && player.dy === 0) continue;

    // Normalize diagonal movement
    let mx = player.dx;
    let my = player.dy;
    if (mx !== 0 && my !== 0) {
      const len = Math.sqrt(mx * mx + my * my);
      mx /= len;
      my /= len;
    }

    player.x += mx * speed * dt;
    player.y += my * speed * dt;

    // Clamp to world bounds
    const half = PLAYER_SIZE / 2;
    player.x = Math.max(half, Math.min(WORLD_WIDTH - half, player.x));
    player.y = Math.max(half, Math.min(WORLD_HEIGHT - half, player.y));
  }
}

function netTick() {
  if (players.size === 0) return;

  const snapshot = {};
  for (const [id, p] of players) {
    snapshot[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  broadcast({ type: "snapshot", players: snapshot });
}

setInterval(simTick, SIM_INTERVAL);
setInterval(netTick, NET_INTERVAL);

// ── Helpers ───────────────────────────────────────────────────
function send(socket, data) {
  if (socket.readyState === 1) { // WebSocket.OPEN
    socket.send(JSON.stringify(data));
  }
}

function broadcast(data, excludeId) {
  const json = JSON.stringify(data);
  for (const [id, player] of players) {
    if (id !== excludeId && player.socket.readyState === 1) {
      player.socket.send(json);
    }
  }
}

// ── Start ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`PTFv2 server listening on http://localhost:${PORT}`);
  console.log(`  Sim tick: ${GAME_CONFIG.TICK_RATE}Hz | Net tick: ${GAME_CONFIG.NET_RATE}Hz`);
  console.log(`  World: ${GAME_CONFIG.WORLD_WIDTH}x${GAME_CONFIG.WORLD_HEIGHT}`);
});
