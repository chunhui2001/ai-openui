import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

const pageRoutes = new Set(['/about', '/developer', '/ai-playground', '/code'])
const pagePaths = new Set(['/', ...[...pageRoutes].map((path) => `${path}/`)])

function pageRoutePlugin(): Plugin {
  const redirect = (
    req: { url?: string; headers?: { accept?: string } },
    res: {
      statusCode: number
      setHeader(name: string, value: string): void
      end(body?: string): void
    },
    next: () => void,
  ): void => {
    if (!req.url) {
      next()

      return
    }

    const [pathname, query] = req.url.split('?', 2)

    if (pageRoutes.has(pathname)) {
      res.statusCode = 302
      res.setHeader('Location', `${pathname}/${query ? `?${query}` : ''}`)
      res.end()

      return
    }

    const isServiceRoute = ['/ollama', '/whisper', '/tts'].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )

    const isViteInternalRoute =
      pathname === '/@vite' ||
      pathname.startsWith('/@vite/') ||
      pathname === '/@id' ||
      pathname.startsWith('/@id/') ||
      pathname === '/@fs' ||
      pathname.startsWith('/@fs/')
    const isAssetRequest = pathname.includes('.')

    if (!pagePaths.has(pathname) && !isServiceRoute && !isViteInternalRoute && !isAssetRequest) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<!doctype html><title>404 Not Found</title><h1>404 Not Found</h1>')

      return
    }

    next()
  }

  return {
    name: 'page-routes',
    configureServer(server) {
      server.middlewares.use(redirect)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect)
    },
  }
}

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
    appType: 'mpa',
    plugins: [pageRoutePlugin()],
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
          code: resolve(rootDir, 'src/code/index.html'),
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
