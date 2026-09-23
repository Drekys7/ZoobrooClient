import { useEffect, useMemo, useState } from 'react'
import { PawPrint, RotateCcw } from 'lucide-react'
import { MapCanvas } from './components/MapCanvas'
import { HttpMapRepository, type MapRepository } from './data/map-repository'
import { MapLoader } from './data/map-loader'
import { toVisitorMap } from './data/visitor-map'
import type { PreparedMap } from './data/map-repository'
import { preventPageZoom } from './components/page-zoom'

const defaultRepository = new HttpMapRepository(new URL(import.meta.env.VITE_MAP_MANIFEST_URL || `${import.meta.env.BASE_URL}data/manifest.json`, location.href).href)
export default function App({ repository = defaultRepository }: { repository?: MapRepository }) {
  useEffect(() => preventPageZoom(document.getElementById('root')!), [])
  const [snapshot, setSnapshot] = useState<PreparedMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const data = useMemo(() => snapshot ? toVisitorMap(snapshot) : null, [snapshot])
  useEffect(() => {
    let storage: Storage | undefined
    try { storage = localStorage } catch { /* Works with storage disabled. */ }
    const loader = new MapLoader(repository, undefined, storage)
    let disposed = false, busy = false
    let controller: AbortController | undefined
    const refresh = async () => {
      if (busy || disposed || document.visibilityState === 'hidden') return
      busy = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 20_000)
      try {
        const next = await loader.refresh(controller.signal)
        if (!disposed) { setSnapshot(next); setFailed(false) }
      } catch (error) {
        if (import.meta.env.DEV && !disposed) console.warn('Map load failed', error)
        // Keep the current screen untouched when a background update fails.
        clearTimeout(timeout)
        const fallbackController = new AbortController()
        controller = fallbackController
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10_000)
        const cached = disposed ? null : await loader.fallback(fallbackController.signal)
        clearTimeout(fallbackTimeout)
        if (!disposed) { if (cached) setSnapshot(cached); else setFailed(true) }
      } finally { clearTimeout(timeout); busy = false }
    }
    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = setInterval(() => { void refresh() }, 300_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    const unsubscribe = repository.subscribe?.(() => { void refresh() })
    return () => { disposed = true; controller?.abort(); clearInterval(timer); unsubscribe?.(); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible) }
  }, [repository, retry])
  if (data) return <main className="app-map"><MapCanvas key={`${data.snapshot.projectId}:${data.backgroundWidth}:${data.backgroundHeight}`} data={data} /></main>
  return <main className="loading-screen" aria-live="polite">
    <div className="loading-mark"><PawPrint size={32} strokeWidth={1.5}/></div>
    <h1>ZooBroo</h1>
    {failed ? <><p>Die Karte konnte nicht geladen werden.<br/>Bitte prüfe deine Internetverbindung.</p><button onClick={() => { setFailed(false); setRetry(value => value + 1) }}><RotateCcw size={16}/>Erneut versuchen</button></> : <><p>Dein Zoo. Deine Entdeckungsreise.</p><span className="loading-progress" role="status" aria-label="Karte wird geladen"/></>}
  </main>
}
