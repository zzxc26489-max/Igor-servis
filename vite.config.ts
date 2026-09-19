import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const productionCsp = {
  name: 'production-csp',
  apply: 'build' as const,
  transformIndexHtml() {
    return [{
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
      injectTo: 'head-prepend' as const,
    }]
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: '/Igor-servis/',
  plugins: [react(), tailwindcss(), productionCsp],
})
