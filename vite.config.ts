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
    const hasUrl = Boolean(String(env.VITE_SUPABASE_URL ?? '').trim())
    const hasKey = Boolean(anonKey)

    if (hasUrl !== hasKey) {
      throw new Error('Production build requires both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or neither for local-only mode')
    }
    if (hasUrl && !supabaseOrigin) {
      throw new Error('Production VITE_SUPABASE_URL must be a valid HTTPS URL')
    }
  }

  return {
    base: '/Igor-servis/',
    plugins: [react(), tailwindcss(), productionCsp(supabaseOrigin)],
  }
})
