import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ollama = process.env.OLLAMA_BASE_URL || env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
  const whisper = process.env.WHISPER_BASE_URL || env.WHISPER_BASE_URL || 'http://127.0.0.1:8173'
  const tts = process.env.TTS_BASE_URL || env.TTS_BASE_URL || 'http://127.0.0.1:8273'
  const assetsHash = !/^(0|false|off|no)$/i.test(process.env.ASSETS_HASH || env.ASSETS_HASH || '1')

  const proxy = {
    '/ollama': {
      target: ollama,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/ollama/, ''),
    },
    '/whisper': {
      target: whisper,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/whisper/, ''),
    },
    '/tts': {
      target: tts,
      changeOrigin: true,
      timeout: 600_000,
      proxyTimeout: 600_000,
      rewrite: (path: string) => path.replace(/^\/tts/, ''),
    },
  }

  return {
    root: resolve(rootDir, 'src'),
    publicDir: resolve(rootDir, 'public'),
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
    build: {
      outDir: resolve(rootDir, 'dist'),
      assetsDir: 'RichMedias',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: resolve(rootDir, 'src/index.html'),
          playground: resolve(rootDir, 'src/ai-playground/index.html'),
          about: resolve(rootDir, 'src/about/index.html'),
          developer: resolve(rootDir, 'src/developer/index.html'),
        },
        output: {
          entryFileNames: assetsHash ? 'RichMedias/[name]-[hash].js' : 'RichMedias/[name].js',
          chunkFileNames: assetsHash ? 'RichMedias/[name]-[hash].js' : 'RichMedias/[name].js',
          assetFileNames: assetsHash ? 'RichMedias/[name]-[hash][extname]' : 'RichMedias/[name][extname]',
        },
      },
    },
  }
})
