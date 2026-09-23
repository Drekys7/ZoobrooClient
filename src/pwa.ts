/** Production only: keep Vite development and plain HTTP LAN previews untouched. */
export function registerPwa() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return
  const base = new URL(import.meta.env.BASE_URL, location.href)
  // The first visit can load the map before the worker claims the page.
  // Re-request the manifest under its control so the next offline launch works.
  const warmManifest = () => {
    if (!navigator.serviceWorker.controller) return
    const url = new URL(import.meta.env.VITE_MAP_MANIFEST_URL || 'data/manifest.json', base)
    void fetch(url, { cache: 'no-cache' }).catch(() => {})
  }
  navigator.serviceWorker.addEventListener('controllerchange', warmManifest)
  void navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname, updateViaCache: 'none' })
    .then(registration => {
      warmManifest()
      let lastChecked = Date.now()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastChecked < 3600_000) return
        lastChecked = Date.now()
        void registration.update().catch(() => {})
      })
    })
    .catch(error => console.warn('ZooBroo offline support unavailable', error))
}
