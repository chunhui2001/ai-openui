import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ollama =
    process.env.OLLAMA_BASE_URL || env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'

  const proxy = {
    '/ollama': {
      target: ollama,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/ollama/, ''),
    },
  }

  return {
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      proxy,
    },
  }
})
