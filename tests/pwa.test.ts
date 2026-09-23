// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { expect, it } from 'vitest'
import sharp from 'sharp'
import { mapPrecacheEntries } from '../scripts/pwa-config'

it('makes the complete current overview bootable offline without downloading galleries, tiles or archived versions', () => {
  const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'))
  const file = resolve('public/data', manifest.contractUrl)
  const map = JSON.parse(readFileSync(file, 'utf8'))
  const urls = new Set(mapPrecacheEntries().map(entry => entry.url))
  const path = (url: string) => relative(resolve('public'), resolve(dirname(file), url)).replaceAll('\\', '/')
  expect(urls.has(`data/${manifest.contractUrl}`)).toBe(true)
  expect(urls.has(`data/${manifest.raster.previewUrl}`)).toBe(true)
  for (const category of map.categories) if (category.defaultIcon) expect(urls.has(path(category.defaultIcon.url))).toBe(true)
  for (const root of map.items) for (const item of [root, ...(root.members ?? [])]) {
    if (item.icon) expect(urls.has(path(item.icon.url))).toBe(true)
    for (const fact of item.facts) if (fact.icon) expect(urls.has(path(fact.icon.url))).toBe(true)
    for (const photo of item.images ?? []) expect(urls.has(path(photo.url))).toBe(false)
  }
  expect(urls.has(path(map.background.url))).toBe(false)
  expect([...urls].filter(url => url.includes('/versions/'))).toEqual([`data/${manifest.contractUrl}`])
  expect([...urls].some(url => url.endsWith('.webp'))).toBe(false)
  expect(urls.has('data/manifest.json')).toBe(false) // Mutable pointer must stay network-first.
})

it('provides correctly sized opaque launcher and Apple icons', async () => {
  for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['icon-maskable-512', 512], ['apple-touch-icon', 180]] as const) {
    const icon = sharp(`public/pwa/${name}.png`)
    expect(await icon.metadata()).toMatchObject({ format: 'png', width: size, height: size })
    expect((await icon.stats()).isOpaque).toBe(true)
  }
})
