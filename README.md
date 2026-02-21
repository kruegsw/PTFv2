# PTFv2 — Point To Fire (Proof of Concept)

Minimal working multiplayer game. Plain JavaScript, no build step for server.

**Stack:** Phaser 3 (client) + WebSocket/ws (server) + Vite (dev server)

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.
Open a second tab to see multiplayer — each tab is a separate player.

## Controls

- **WASD** or **Arrow Keys** to move
- Blue square = you, orange squares = other players

## Project Structure

```
ptfv2/
├── shared/src/index.js          # Game constants (used by client + server)
├── client/src/
│   ├── main.js                  # Boots Phaser
│   ├── scenes/GameplayScene.js  # Game logic, input, rendering
│   └── net/NetworkClient.js     # WebSocket connection
├── server/src/
│   └── main.js                  # Game loop, player state, WebSocket server
└── package.json                 # Workspace root
```

## How It Works

1. Client connects via WebSocket to server
2. Server assigns player ID + spawn position, sends `welcome`
3. Client reads WASD/Arrow input, sends `intent_move` (dx, dy)
4. Server runs physics at 60Hz, moves all players
5. Server broadcasts `snapshot` (all positions) at 20Hz
6. Client updates sprites from snapshots

## Production Mode

```bash
npm run build   # Builds client into client/dist/
npm start       # Server serves client files + WebSocket on :8080
```

Open **http://localhost:8080** — single server, single URL.
