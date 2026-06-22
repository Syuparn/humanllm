import type { WebSocket } from 'ws'

const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
}

export function removeClient(ws: WebSocket): void {
  clients.delete(ws)
}

export function broadcast(message: object): void {
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data)
    }
  }
}
