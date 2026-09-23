import { z } from 'zod'
import { validatePublishedZooMap, type PublishedZooMap } from '../public-contract/published-zoo-map'

export const RasterSchema = z.object({
  sourceAssetId: z.string().min(1), previewUrl: z.string().min(1), tileUrl: z.string().min(1),
  tileSize: z.literal(512), minNativeZoom: z.number().int().min(-8).max(0), maxNativeZoom: z.literal(0),
  zoomOffset: z.number().int().min(0).max(8),
})
export type MapRaster = z.infer<typeof RasterSchema>
export type PreparedMap = PublishedZooMap & { raster?: MapRaster }
export const ManifestSchema = z.object({
  zooId: z.string().min(1), projectId: z.string().min(1), schemaVersion: z.literal(1),
  version: z.number().int().positive(), publishedAt: z.string().datetime({ offset: true }),
  raster: RasterSchema.optional(),
  contractUrl: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/i),
})
export type MapManifest = z.infer<typeof ManifestSchema>
/** Only this port knows where data lives. A Firestore listener can implement subscribe(). */
export interface MapRepository {
  readonly cacheKey: string
  getManifest(signal: AbortSignal): Promise<MapManifest>
  getSnapshot(manifest: MapManifest, signal: AbortSignal): Promise<PreparedMap>
  subscribe?(onChange: () => void): () => void
}
export function httpUrl(value: string, base: string): string {
  const url = new URL(value, base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported asset URL')
  return url.href
}
export function resolveSnapshot(input: unknown, base: string): PublishedZooMap {
  const snapshot = validatePublishedZooMap(input)
  if (snapshot.schemaVersion !== 1) throw new Error('Unsupported map schema')
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if ('assetId' in value && 'url' in value && typeof value.url === 'string') value.url = httpUrl(value.url, base)
    Object.values(value).forEach(visit)
  }
  visit(snapshot)
  return snapshot
}
export class HttpMapRepository implements MapRepository {
  readonly cacheKey: string
  constructor(private readonly manifestUrl: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.cacheKey = `zoobroo:last-map:${manifestUrl}`
  }
  async getManifest(signal: AbortSignal) {
    const response = await this.fetcher(this.manifestUrl, { signal, cache: 'no-cache' })
    if (!response.ok) throw new Error(`Manifest: HTTP ${response.status}`)
    const manifest = ManifestSchema.parse(await response.json())
    const base = response.url || this.manifestUrl
    return { ...manifest, contractUrl: httpUrl(manifest.contractUrl, base), raster: manifest.raster && {
      ...manifest.raster, previewUrl: httpUrl(manifest.raster.previewUrl, base),
      tileUrl: httpUrl(manifest.raster.tileUrl, base).replaceAll('%7B', '{').replaceAll('%7D', '}'),
    } }
  }
  async getSnapshot(manifest: MapManifest, signal: AbortSignal) {
    const response = await this.fetcher(manifest.contractUrl, { signal, cache: 'default' })
    if (!response.ok) throw new Error(`Map: HTTP ${response.status}`)
    const text = await response.text()
    // SubtleCrypto is available on HTTPS and localhost. Plain-HTTP LAN previews still validate the schema.
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (hash !== manifest.sha256.toLowerCase()) throw new Error('Map checksum mismatch')
    }
    const snapshot = resolveSnapshot(JSON.parse(text), response.url || manifest.contractUrl)
    if (snapshot.projectId !== manifest.projectId || snapshot.version !== manifest.version || snapshot.schemaVersion !== manifest.schemaVersion) throw new Error('Manifest and map do not match')
    if (manifest.raster && manifest.raster.sourceAssetId !== snapshot.background.assetId) throw new Error('Raster and background do not match')
    return { ...snapshot, raster: manifest.raster }
  }
}

