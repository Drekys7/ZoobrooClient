import { useEffect, useId, useState } from 'react'
import { DEFAULT_TYPOGRAPHY, FONT_PRESETS, type Typography } from '../domain/typography'

export function useMapFont(value: Typography = DEFAULT_TYPOGRAPHY, urls: Record<string, string> = {}) {
  const id = useId().replace(/[^a-z0-9]/gi, '')
  const regular = value.regularAssetId ? urls[value.regularAssetId] : undefined
  const bold = !value.variable && value.boldAssetId ? urls[value.boldAssetId] : undefined
  const [loaded, setLoaded] = useState<{ key: string; family: string } | null>(null)
  const key = JSON.stringify([regular, bold, value.variable])
  useEffect(() => {
    if (value.preset !== 'custom' || !regular || typeof FontFace === 'undefined') return
    let cancelled = false
    const family = `ZooFont${id}${Date.now()}`
    const faces = [new FontFace(family, `url(${JSON.stringify(regular)})`, { weight: value.variable ? '100 900' : '400', display: 'swap' })]
    if (bold) faces.push(new FontFace(family, `url(${JSON.stringify(bold)})`, { weight: '600 900', display: 'swap' }))
    Promise.all(faces.map(face => face.load())).then(() => {
      if (cancelled) return
      faces.forEach(face => document.fonts.add(face))
      setLoaded({ key, family })
    }).catch(() => { if (!cancelled) setLoaded(null) })
    return () => { cancelled = true; faces.forEach(face => document.fonts.delete(face)) }
  }, [key, regular, bold, value.variable, value.preset, id])
  return value.preset === 'custom'
    ? loaded?.key === key ? `"${loaded.family}", ${FONT_PRESETS.manrope.family}` : FONT_PRESETS.manrope.family
    : FONT_PRESETS[value.preset].family
}
