import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { VitePWA } from 'vite-plugin-pwa'

// Precache only the current map's overview, icons and fonts. Never pull every
// photo, tile or archived map version into the first visit's network traffic.
export function mapPrecacheEntries() {
  const origin = 'https://build.invalid/'
  const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'))
  const contractUrl = new URL(manifest.contractUrl, `${origin}data/`)
  const snapshot = JSON.parse(readFileSync(`public${contractUrl.pathname}`, 'utf8'))
  const paths = new Set([contractUrl.pathname.slice(1)])
  const add = (url?: string, base = contractUrl.href) => {
    if (!url) return
    const resolved = new URL(url, base)
    if (resolved.origin !== new URL(origin).origin) return
    paths.add(resolved.pathname.slice(1))
  }
  add(manifest.raster?.previewUrl, `${origin}data/`)
  if (!manifest.raster) add(snapshot.background.url)
  for (const category of snapshot.categories) add(category.defaultIcon?.url)
  for (const root of snapshot.items) for (const item of [root, ...(root.members ?? [])]) {
    add(item.icon?.url)
    for (const fact of item.facts) add(fact.icon?.url)
  }
  for (const typography of [snapshot.mapSettings.typography, snapshot.mapSettings.zones?.typography]) {
    add(typography?.regular?.url)
    add(typography?.bold?.url)
  }
  return [...paths].map(url => ({ url, revision: createHash('sha256').update(readFileSync(`public/${url}`)).digest('hex') }))
}

export function zooPwa() {
  return VitePWA({
    injectRegister: null,
    // A new shell takes over on next launch; never reload during a map gesture.
    registerType: 'prompt',
    includeAssets: ['pwa/*.png'],
    manifest: {
      id: './', name: 'ZooBroo · Interaktive Zoo-Karte', short_name: 'ZooBroo',
      description: 'Tiere, Lebensräume und Veranstaltungen auf deiner Zoo-Karte.',
      lang: 'de', start_url: './', scope: './', display: 'standalone',
      theme_color: '#2f7d59', background_color: '#e7ebde',
      icons: [
        { src: 'pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      clientsClaim: true, skipWaiting: false, cleanupOutdatedCaches: true,
      globPatterns: ['**/*.{js,css,html,woff2}', 'zooweb/icons/*.png'],
      additionalManifestEntries: mapPrecacheEntries(),
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/\/data\//, /\/pwa\//, /\/assets\//],
      runtimeCaching: [
        {
          urlPattern: ({ url, request }) => request.destination === '' && /\/data\/(manifest\.json|versions\/[^/]+\/map\.json)$/.test(url.pathname),
          handler: 'NetworkFirst',
          options: { cacheName: 'zoobroo-map-data-v1', networkTimeoutSeconds: 3, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 20 } },
        },
        {
          urlPattern: ({ url }) => /\/data\/rasters\//.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'zoobroo-map-tiles-v1', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 256, maxAgeSeconds: 30 * 86400, purgeOnQuotaError: true } },
        },
        {
          urlPattern: ({ url }) => /\/data\/media\//.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'zoobroo-map-media-v1', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 192, maxAgeSeconds: 30 * 86400, purgeOnQuotaError: true } },
        },
      ],
    },
  })
}
