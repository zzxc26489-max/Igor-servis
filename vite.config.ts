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
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim()

  if (mode === 'production') {
    if (!supabaseOrigin) {
      throw new Error('Production build requires a valid HTTPS VITE_SUPABASE_URL')
    }
    if (!anonKey) {
      throw new Error('Production build requires VITE_SUPABASE_ANON_KEY')
    }
  }

  return {
    base: '/Igor-servis/',
    plugins: [react(), tailwindcss(), productionCsp(supabaseOrigin)],
  }
})
