import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import type { IncomingMessage, ServerResponse } from 'http'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // selfHandleResponse: true でプロキシのバッファリングを無効化し
        // proxyRes.pipe(res) で各チャンクを即時転送する
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const nodeRes = res as ServerResponse
            nodeRes.writeHead(
              proxyRes.statusCode ?? 200,
              proxyRes.headers as Record<string, string>,
            )
            proxyRes.pipe(nodeRes)
          })
          proxy.on('error', (_err, _req, res) => {
            const nodeRes = res as ServerResponse
            nodeRes.writeHead(502)
            nodeRes.end('Bad Gateway')
          })
        },
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
})
