import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { HttpMapRepository, ManifestSchema, resolveSnapshot, type MapRepository, type MapManifest } from '../src/data/map-repository'
import { MapLoader } from '../src/data/map-loader'
import { toVisitorMap } from '../src/data/visitor-map'
import { validatePublishedZooMap } from '../src/public-contract/published-zoo-map'
const manifest = ManifestSchema.parse(JSON.parse(readFileSync('public/data/manifest.json', 'utf8')))
const contractFile = resolve('public/data', manifest.contractUrl)
const text = readFileSync(contractFile, 'utf8')
const raw = JSON.parse(text)
const snapshot = resolveSnapshot(raw, 'https://maps.example/data/versions/test/map.json')
const signal = new AbortController().signal

it('ships the exact baseline counts and every referenced asset, with a matching checksum', () => {
  expect(createHash('sha256').update(text).digest('hex')).toBe(manifest.sha256)
  const data = toVisitorMap(snapshot)
  expect(data.items).toHaveLength(41)
  expect(data.items.reduce((n, item) => n + (item.members?.length ?? 0), 0)).toBe(14)
  expect(data.categories).toHaveLength(8)
  expect(data.mapSettings.zones?.labels).toHaveLength(6)
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if ('assetId' in value && 'url' in value) expect(existsSync(resolve(dirname(contractFile), String(value.url)))).toBe(true)
    Object.values(value).forEach(visit)
  }
  visit(raw)
  const raster = manifest.raster!
  expect(existsSync(resolve('public/data', raster.previewUrl))).toBe(true)
  for (let z = 0; z <= raster.zoomOffset; z++) {
    const scale = 2 ** (z - raster.zoomOffset)
    for (let x = 0; x < Math.ceil(raw.background.width * scale / 512); x++) {
      for (let y = 0; y < Math.ceil(raw.background.height * scale / 512); y++) {
        expect(existsSync(resolve('public/data', raster.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))))).toBe(true)
      }
    }
  }
})
it('preserves marker overrides, group content, zones, gallery ordering and credits through adaptation', () => {
  const data = toVisitorMap(snapshot)
  snapshot.items.forEach((item, index) => {
    const mapped = data.items[index]
    expect(mapped.position).toEqual(item.position)
    expect(mapped.description).toBe(item.description)
    expect(mapped.markerOverrides).toEqual(item.markerOverrides)
    expect(mapped.imageCredits).toEqual(item.imageCredits)
    expect(data.getItemImageUrls(mapped)).toEqual((item.images ?? (item.image ? [item.image] : [])).map(a => a.url))
    item.members?.forEach((member, i) => expect(mapped.members?.[i].description).toEqual(member.description))
  })
  expect(data.mapSettings.zones?.labels).toEqual(snapshot.mapSettings.zones?.labels)
})
it('rejects incompatible schema, unsafe URLs, and invalid coordinates', () => {
  expect(() => resolveSnapshot({ ...raw, schemaVersion: 99 }, 'https://maps.example/')).toThrow()
  expect(() => resolveSnapshot({ ...raw, background: { ...raw.background, url: 'javascript:alert(1)' } }, 'https://maps.example/')).toThrow()
  expect(() => validatePublishedZooMap({ ...raw, items: [{ ...raw.items[0], position: { x: 2, y: 0 } }] })).toThrow()
})
it('HTTP repository resolves paths against the manifest and snapshot independently', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(manifest))).mockResolvedValueOnce(new Response(text))
  const repo = new HttpMapRepository('https://maps.example/zoo/data/manifest.json', fetcher)
  const m = await repo.getManifest(signal)
  expect(m.contractUrl).toBe(`https://maps.example/zoo/data/${manifest.contractUrl}`)
  const loaded = await repo.getSnapshot(m, signal)
  expect(loaded.background.url).toContain('https://maps.example/zoo/data/media/')
  expect(loaded.raster?.tileUrl).toContain('/{z}/{x}/{y}.webp')
})
it('rejects a manifest pointing to another project', async () => {
  const repo = new HttpMapRepository('https://maps.example/manifest.json', vi.fn().mockResolvedValue(new Response(text)))
  await expect(repo.getSnapshot({ ...manifest, projectId: 'wrong', contractUrl: 'https://maps.example/map.json' }, signal)).rejects.toThrow('do not match')
})
function fixture() {
  let nextManifest: MapManifest = { ...manifest }
  let nextSnapshot = snapshot
  const repo: MapRepository = { cacheKey: 'test', getManifest: vi.fn(async () => nextManifest), getSnapshot: vi.fn(async () => nextSnapshot) }
  const prepare = vi.fn(async () => {})
  const cache = new Map<string, string>()
  const storage = { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => { cache.set(key, value) } }
  const loader = new MapLoader(repo, prepare, storage)
  return { repo, prepare, loader, storage, update: (version: number) => { nextManifest = { ...manifest, version }; nextSnapshot = { ...snapshot, version } } }
}
describe('atomic updates and recovery', () => {
  it('does not reload unchanged releases', async () => {
    const f = fixture()
    const first = await f.loader.refresh(signal)
    expect(await f.loader.refresh(signal)).toBe(first)
    expect(f.repo.getSnapshot).toHaveBeenCalledTimes(1)
    expect(f.prepare).toHaveBeenCalledTimes(1)
  })
  it('keeps the previous release when new media fail and retries on the next refresh', async () => {
    const f = fixture()
    const first = await f.loader.refresh(signal)
    f.update(2)
    f.prepare.mockRejectedValueOnce(new Error('missing image'))
    await expect(f.loader.refresh(signal)).rejects.toThrow('missing image')
    expect(await f.loader.fallback(signal)).toBe(first)
    expect((await f.loader.refresh(signal)).version).toBe(2)
  })
  it('supports a deliberate server rollback to an older version', async () => {
    const f = fixture()
    f.update(2); await f.loader.refresh(signal)
    f.update(1); expect((await f.loader.refresh(signal)).version).toBe(1)
  })
  it('restores the last valid version from persistent storage, without trusting corrupted data', async () => {
    const f = fixture()
    await f.loader.refresh(signal)
    const second = new MapLoader(f.repo, f.prepare, f.storage)
    expect((await second.fallback(signal))?.projectId).toBe(snapshot.projectId)
    f.storage.setItem('test', '{}')
    expect(await new MapLoader(f.repo, f.prepare, f.storage).fallback(signal)).toBeNull()
  })
  it('does not activate an aborted update', async () => {
    const f = fixture()
    const first = await f.loader.refresh(signal)
    f.update(2)
    const controller = new AbortController(); controller.abort()
    await expect(f.loader.refresh(controller.signal)).rejects.toThrow()
    expect(await f.loader.fallback(signal)).toBe(first)
  })
  it('keeps working if persistent storage is blocked or full', async () => {
    const f = fixture()
    const loader = new MapLoader(f.repo, f.prepare, { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('full') } })
    expect(await loader.fallback(signal)).toBeNull()
    expect((await loader.refresh(signal)).items).toHaveLength(41)
  })
})

it('verifies SHA-256 before accepting downloaded data', async () => {
  const { webcrypto } = await import('node:crypto')
  vi.stubGlobal('crypto', webcrypto)
  try {
    const repo = new HttpMapRepository('https://maps.example/manifest.json', vi.fn().mockResolvedValue(new Response(text)))
    await expect(repo.getSnapshot({ ...manifest, sha256: '0'.repeat(64), contractUrl: 'https://maps.example/map.json' }, signal)).rejects.toThrow('checksum')
  } finally { vi.unstubAllGlobals() }
})
it('retains raster delivery metadata when restoring the last good snapshot', async () => {
  const f = fixture()
  const raster = { ...manifest.raster!, previewUrl: 'https://maps.example/preview.jpg', tileUrl: 'https://maps.example/{z}/{x}/{y}.webp' }
  f.storage.setItem('test', JSON.stringify({ ...snapshot, raster }))
  expect((await f.loader.fallback(signal))?.raster).toEqual(raster)
})
