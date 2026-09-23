import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PawPrint } from 'lucide-react'
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

// Reuse the same Lucide paw and green as the existing ZooBroo loading mark.
const paw = renderToStaticMarkup(createElement(PawPrint, { size: 256, color: '#ffffff', strokeWidth: 1.8 }))
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#2f7d59"/><g transform="translate(128 128)">${paw}</g></svg>`)
await mkdir('public/pwa', { recursive: true })
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['icon-maskable-512', 512], ['apple-touch-icon', 180]]) {
  await sharp(svg).resize(size, size).png().toFile(`public/pwa/${name}.png`)
}
