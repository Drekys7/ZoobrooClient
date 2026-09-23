import { createServer } from 'vite'
import sharp from 'sharp'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { resolve, dirname, extname } from 'node:path'
import { createHash } from 'node:crypto'

// Read-only import from the editor. Runtime has no dependency on the admin checkout.
const admin = resolve(process.argv[2] || '../ZooBrooAdmin')
const source = resolve(process.argv[3] || `${admin}/public/startup-template.json`)
const root = process.cwd()
const template = JSON.parse(await readFile(source, 'utf8'))
const server = await createServer({ root: admin, configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { MapProjectSchema } = await server.ssrLoadModule('/src/domain/models.ts')
  const { buildPublishedSnapshot } = await server.ssrLoadModule('/src/application/publishing.ts')
  const project = MapProjectSchema.parse(template.project)
  const assets = new Map(template.assets.map(entry => [entry.asset.id, entry]))
  const used = new Set()
  const urls = new Map()
  for (const [id, { asset, base64 }] of assets) {
    const bytes = Buffer.from(base64, 'base64')
    if (bytes.length !== asset.size) throw new Error(`Invalid bytes for ${id}`)
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 20)
    const extension = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'font/woff2': '.woff2', 'font/ttf': '.ttf' })[asset.mimeType] || extname(asset.name)
    if (!/^\.[a-z0-9]+$/i.test(extension)) throw new Error(`Invalid extension for ${id}`)
    urls.set(id, `../../media/${digest}${extension}`)
  }
  // Deterministic export makes the same baseline reproducible.
  const publishedAt = project.updatedAt
  const snapshot = buildPublishedSnapshot(project, 1, publishedAt, id => {
    if (!urls.has(id)) throw new Error(`Referenced media missing: ${id}`)
    used.add(id)
    return urls.get(id)
  })
  const text = JSON.stringify(snapshot)
  const sha256 = createHash('sha256').update(text).digest('hex')
  const contractUrl = `versions/${sha256.slice(0, 20)}/map.json`
  for (const id of used) {
    const target = resolve(root, 'public/data/media', urls.get(id).split('/').at(-1))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, Buffer.from(assets.get(id).base64, 'base64'))
  }
  await mkdir(resolve(root, 'public/data', dirname(contractUrl)), { recursive: true })
  await writeFile(resolve(root, 'public/data', contractUrl), text)
  const background = assets.get(project.backgroundAssetId)
  const original = Buffer.from(background.base64, 'base64')
  const rasterId = createHash('sha256').update(original).digest('hex').slice(0, 20)
  const rasterRoot = resolve(root, 'public/data/rasters', rasterId)
  await mkdir(rasterRoot, { recursive: true })
  // The repository also contains the matching compact 1254px JPG, before 4x upscaling.
  // Use it for the overview only when it belongs to this exact background revision.
  let overview = original
  try {
    const reference = await readFile(resolve(admin, 'public/zoo-maps/zoo-map-cartoon-1-reference-zone-colors-realesrgan-4x-v40.jpg'))
    if (reference.equals(original)) overview = await readFile(resolve(admin, 'public/zoo-maps/zoo-map-cartoon-1-reference-zone-colors-v39.jpg'))
  } catch { /* Other zoo exports need no built-in reference. */ }
  await sharp(overview).resize({ width: 1254, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(resolve(rasterRoot, 'preview.jpg'))
  const zoomOffset = Math.max(0, Math.ceil(Math.log2(Math.max(project.backgroundWidth, project.backgroundHeight) / 512)))
  let tileCount = 0
  for (let z = 0; z <= zoomOffset; z++) {
    const scale = 2 ** (z - zoomOffset)
    const width = Math.ceil(project.backgroundWidth * scale), height = Math.ceil(project.backgroundHeight * scale)
    const resized = await sharp(original).resize(width, height, { fit: 'fill' }).png().toBuffer()
    for (let x = 0; x < Math.ceil(width / 512); x++) {
      await mkdir(resolve(rasterRoot, String(z), String(x)), { recursive: true })
      await Promise.all(Array.from({ length: Math.ceil(height / 512) }, async (_, y) => {
        const w = Math.min(512, width - x * 512), h = Math.min(512, height - y * 512)
        await sharp(resized).extract({ left: x * 512, top: y * 512, width: w, height: h })
          .extend({ top: 0, left: 0, right: 512 - w, bottom: 512 - h, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: 88 }).toFile(resolve(rasterRoot, String(z), String(x), `${y}.webp`))
        tileCount++
      }))
    }
  }
  const raster = { sourceAssetId: project.backgroundAssetId, previewUrl: `rasters/${rasterId}/preview.jpg`, tileUrl: `rasters/${rasterId}/{z}/{x}/{y}.webp`, tileSize: 512, minNativeZoom: -zoomOffset, maxNativeZoom: 0, zoomOffset }
  await writeFile(resolve(root, 'public/data/manifest.json.tmp'), JSON.stringify({ zooId: project.id, projectId: project.id, schemaVersion: 1, version: snapshot.version, publishedAt, contractUrl, sha256, raster }, null, 2) + '\n')
  await rename(resolve(root, 'public/data/manifest.json.tmp'), resolve(root, 'public/data/manifest.json'))
  await writeFile(resolve(root, 'docs/baseline.json'), JSON.stringify({ source: 'ZooBrooAdmin/public/startup-template.json', sourceSha256: createHash('sha256').update(await readFile(source)).digest('hex'), projectUpdatedAt: project.updatedAt, importedAt: new Date().toISOString(), categories: project.categories.length, markers: project.items.length, members: project.items.reduce((n, i) => n + (i.members?.length || 0), 0), zones: project.mapSettings.zones?.labels.length || 0, events: snapshot.events.length, assets: used.size, tileCount, mapDimensions: [project.backgroundWidth, project.backgroundHeight], sha256 }, null, 2) + '\n')
  console.log(`Imported ${snapshot.items.length} markers, ${snapshot.categories.length} categories, ${project.mapSettings.zones?.labels.length || 0} zones, ${used.size} assets. SHA256 ${sha256}`)
} finally { await server.close() }
