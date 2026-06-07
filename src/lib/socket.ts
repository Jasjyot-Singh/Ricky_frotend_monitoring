/**
 * Native WebSocket client for Spring Boot backend.
 * Replaces Socket.IO — the backend uses Spring WebSocket at /ws endpoint.
 * Messages arrive as JSON: { "event": "telemetry-update", "data": {...} }
 */

const WS_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080')
  .replace(/^http/, 'ws') + '/ws';

type EventHandler = (data: unknown) => void;

class FleetWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectDelay = 1000;
  private maxReconnectDelay = 15000;
  private shouldReconnect = true;
  private _connected = false;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('🟢 Connected to fleet WebSocket');
        this._connected = true;
        this.reconnectDelay = 1000;
        this.notifyConnectionChange(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event && msg.data) {
            this.emit(msg.event, msg.data);
          }
        } catch (err) {
          console.warn('⚠️ Failed to parse WebSocket message:', err);
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔴 WebSocket disconnected:', event.reason || 'Connection closed');
        this._connected = false;
        this.notifyConnectionChange(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.warn('⚠️ WebSocket error:', error);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.notifyConnectionChange(false);
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private emit(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`Error in handler for event "${event}":`, err);
      }
    });
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach((listener) => listener(connected));
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    setTimeout(() => {
      console.log(`🔄 Reconnecting in ${this.reconnectDelay}ms...`);
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }
}

/** Singleton WebSocket instance */
export const fleetSocket = new FleetWebSocket();
