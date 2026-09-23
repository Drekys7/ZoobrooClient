export const DEFAULT_ACCENT_COLOR = '#2F7D59'

function luminance(rgb: number[]): number {
  const linear = rgb.map(value => {
    const channel = value / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}

export function accentVariables(color = DEFAULT_ACCENT_COLOR): Record<string, string> {
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16))
  let ink = [...rgb]
  while (luminance(ink) > .18) ink = ink.map(value => Math.floor(value * .8))
  return {
    '--map-accent': color,
    '--map-accent-rgb': rgb.join(', '),
    '--map-accent-ink': `rgb(${ink.join(', ')})`,
    '--map-accent-on': luminance(rgb) > .179 ? '#000000' : '#FFFFFF',
  }
}
