// ============================================================
// WebSocket connection to the PTFv2 game server.
// ============================================================

export class NetworkClient {
  constructor(handler) {
    this.socket = null;
    this.handler = handler;

    // In dev: Vite proxies /ws -> ws://localhost:8080
    // In prod behind Apache: /ptf/ws is proxied to Node
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const basePath = window.location.pathname.replace(/\/[^/]*$/, "");
    this.url = `${protocol}//${window.location.host}${basePath}/ws`;
  }

  connect() {
    console.log(`[net] Connecting to ${this.url}`);
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      console.log("[net] Connected");
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handler(msg);
      } catch {
        console.warn("[net] Failed to parse message", event.data);
      }
    };

    this.socket.onclose = () => {
      console.log("[net] Disconnected, reconnecting in 2s...");
      setTimeout(() => this.connect(), 2000);
    };

    this.socket.onerror = (err) => {
      console.warn("[net] WebSocket error", err);
    };
  }

  send(msg) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  get connected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}
