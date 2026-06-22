import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { app } from './api/chat'
import { handleWebSocket } from './ws/handler'

const PORT = 3000

const server = serve({ fetch: app.fetch, port: PORT })

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', handleWebSocket)

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

console.log(`[server] listening on http://localhost:${PORT}`)
