import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

function remoteOrigin(value: string | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
}

function productionCsp(supabaseOrigin: string) {
  const remote = supabaseOrigin ? ` ${supabaseOrigin}` : ''
  return {
    name: 'production-csp',
    apply: 'build' as const,
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            `img-src 'self' data: blob:${remote}`,
            `media-src 'self' blob:${remote}`,
            `connect-src 'self'${remote}`,
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
        injectTo: 'head-prepend' as const,
      }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseOrigin = remoteOrigin(env.VITE_SUPABASE_URL)

  return {
    base: '/Igor-servis/',
    plugins: [react(), tailwindcss(), productionCsp(supabaseOrigin)],
  }
})
