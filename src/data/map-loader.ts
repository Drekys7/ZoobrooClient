import { toVisitorMap } from './visitor-map'
import { resolveSnapshot, RasterSchema, type PreparedMap, type MapRepository } from './map-repository'

/** Decode only the map, visible marker icons and custom fonts before swapping a version.
 * Animal photography remains on-demand, never part of the initial network fan-out. */
export async function prepareMap(snapshot: PreparedMap, signal: AbortSignal) {
  const urls = new Set([snapshot.raster?.previewUrl ?? snapshot.background.url])
  const visibleCategories = new Set(snapshot.categories.filter(c => c.visible).map(c => c.id))
  snapshot.categories.filter(c => c.visible).forEach(c => { if (c.defaultIcon) urls.add(c.defaultIcon.url) })
  snapshot.items.filter(i => i.visible && visibleCategories.has(i.categoryId)).forEach(i => { if (i.icon) urls.add(i.icon.url) })
  const pending = [...urls]
  const decode = (url: string) => new Promise<void>((resolve, reject) => {
    const img = new Image()
    const cleanup = () => { signal.removeEventListener('abort', abort); img.onload = null; img.onerror = null }
    const abort = () => { cleanup(); img.src = ''; reject(new DOMException('Aborted', 'AbortError')) }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    img.onload = () => { void img.decode().catch(() => {}).then(() => { cleanup(); resolve() }) }
    img.onerror = () => { cleanup(); reject(new Error('Map image unavailable')) }
    img.decoding = 'async'
    img.src = url
  })
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (pending.length) { const url = pending.shift()!; await decode(url) }
  }))
  for (const typography of [snapshot.mapSettings.typography, snapshot.mapSettings.zones?.typography]) {
    if (typography?.preset !== 'custom') continue
    for (const asset of [typography.regular, typography.bold]) {
      if (!asset) continue
      const response = await fetch(asset.url, { signal })
      if (!response.ok) throw new Error('Map font unavailable')
      await response.arrayBuffer()
    }
  }
}

export class MapLoader {
  private active: { identity: string; snapshot: PreparedMap } | null = null
  constructor(private readonly repository: MapRepository, private readonly prepare = prepareMap, private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {}
  async refresh(signal: AbortSignal): Promise<PreparedMap> {
    const manifest = await this.repository.getManifest(signal)
    const identity = `${manifest.projectId}:${manifest.version}:${manifest.sha256}:${JSON.stringify(manifest.raster)}`
    if (this.active?.identity === identity) return this.active.snapshot
    const snapshot = await this.repository.getSnapshot(manifest, signal)
    toVisitorMap(snapshot) // Reject inconsistent asset IDs before activating a release.
    await this.prepare(snapshot, signal)
    signal.throwIfAborted()
    this.active = { identity, snapshot }
    try { this.storage?.setItem(this.repository.cacheKey, JSON.stringify(snapshot)) } catch { /* Cache is best effort. */ }
    return snapshot
  }
  async fallback(signal: AbortSignal): Promise<PreparedMap | null> {
    if (this.active) return this.active.snapshot
    try {
      const cached = this.storage?.getItem(this.repository.cacheKey)
      if (!cached) return null
      const parsed = JSON.parse(cached)
      const { raster, ...contract } = parsed
      const snapshot: PreparedMap = { ...resolveSnapshot(contract, location.href), raster: raster ? RasterSchema.parse(raster) : undefined }
      if (snapshot.raster && snapshot.raster.sourceAssetId !== snapshot.background.assetId) return null
      await this.prepare(snapshot, signal)
      signal.throwIfAborted()
      return snapshot
    } catch { return null }
  }
}
