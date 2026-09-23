// Separable max filter: linear work per pixel, independent of outline thickness.
export function dilateAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number) {
  const horizontal = new Uint8ClampedArray(alpha.length)
  const output = new Uint8ClampedArray(alpha.length)
  const queue = new Int32Array(Math.max(width, height))
  const pass = (source: Uint8ClampedArray, target: Uint8ClampedArray, lines: number, length: number, stride: number, lineStride: number) => {
    for (let line = 0; line < lines; line++) {
      let head = 0, tail = 0, next = 0
      const base = line * lineStride
      for (let position = 0; position < length; position++) {
        while (next < length && next <= position + radius) {
          while (tail > head && source[base + queue[tail - 1] * stride] <= source[base + next * stride]) tail--
          queue[tail++] = next++
        }
        while (head < tail && queue[head] < position - radius) head++
        target[base + position * stride] = source[base + queue[head] * stride]
      }
    }
  }
  pass(alpha, horizontal, height, width, 1, width)
  pass(horizontal, output, width, height, width, 1)
  return output
}

export async function createBackgroundOutline(url: string, thickness: number, color: string) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  const radius = Math.max(1, Math.ceil(thickness))
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth + radius * 2
  canvas.height = image.naturalHeight + radius * 2
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Kartenkontur konnte nicht erstellt werden.')
  context.drawImage(image, radius, radius)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels.data[i * 4 + 3]
  const expanded = dilateAlpha(alpha, canvas.width, canvas.height, radius)
  const lowerRadius = Math.floor(thickness)
  const lower = lowerRadius === radius ? expanded : dilateAlpha(alpha, canvas.width, canvas.height, lowerRadius)
  const fraction = thickness - lowerRadius
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))
  for (let i = 0; i < alpha.length; i++) {
    pixels.data[i * 4] = rgb[0]
    pixels.data[i * 4 + 1] = rgb[1]
    pixels.data[i * 4 + 2] = rgb[2]
    const coverage = lowerRadius === radius ? expanded[i] : lower[i] + (expanded[i] - lower[i]) * fraction
    pixels.data[i * 4 + 3] = coverage * (1 - alpha[i] / 255)
  }
  context.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Kartenkontur konnte nicht erstellt werden.')), 'image/png'))
  return { blob, paddingX: radius / image.naturalWidth, paddingY: radius / image.naturalHeight }
}
