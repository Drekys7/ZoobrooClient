import { z } from 'zod'

export const FontPresetSchema = z.enum(['manrope', 'system', 'arial', 'georgia', 'custom'])
export const TypographySchema = z.object({
  preset: FontPresetSchema.default('manrope'),
  regularAssetId: z.string().min(1).nullable().default(null),
  boldAssetId: z.string().min(1).nullable().default(null),
  variable: z.boolean().default(false),
}).strict()
export type Typography = z.infer<typeof TypographySchema>
export const DEFAULT_TYPOGRAPHY: Typography = { preset: 'manrope', regularAssetId: null, boldAssetId: null, variable: false }
export const FONT_PRESETS = {
  manrope: { label: 'Manrope (Standard)', family: "'Manrope Variable', Manrope, system-ui, sans-serif" },
  system: { label: 'Systemschrift', family: 'system-ui, sans-serif' },
  arial: { label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  georgia: { label: 'Georgia', family: 'Georgia, serif' },
  custom: { label: 'Eigene Schrift', family: 'system-ui, sans-serif' },
} as const

export function fontMimeType(name: string): 'font/woff2' | 'font/ttf' {
  if (/\.woff2$/i.test(name)) return 'font/woff2'
  if (/\.ttf$/i.test(name)) return 'font/ttf'
  throw new Error('Bitte eine WOFF2- oder TTF-Datei auswählen.')
}

export async function validateFont(file: File): Promise<void> {
  const mimeType = fontMimeType(file.name)
  if (file.size > 2 * 1024 * 1024 || file.size < (mimeType === 'font/ttf' ? 12 : 48)) {
    throw new Error('Bitte eine gültige WOFF2- oder TTF-Datei mit maximal 2 MB auswählen.')
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Schriftdatei konnte nicht gelesen werden.'))
    reader.readAsArrayBuffer(file)
  })
  const signature = new DataView(buffer).getUint32(0)
  const validSignature = mimeType === 'font/woff2'
    ? signature === 0x774f4632
    : signature === 0x00010000 || signature === 0x74727565
  if (!validSignature) throw new Error('Die Datei ist keine gültige WOFF2- oder TTF-Schrift.')
  const face = new FontFace('ZooFontValidation', buffer)
  try { await face.load() } catch { throw new Error('Die Schriftdatei konnte nicht gelesen werden.') }
}
