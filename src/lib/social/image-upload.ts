// Browser-only: re-encodes any image to a JPEG under 4 MB (Instagram requires JPEG).
export async function prepareInstagramJpeg(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error('Original image must be under 25 MB.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    for (const [maxDim, quality] of [[2160, 0.9], [1800, 0.82], [1440, 0.76]] as const) {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not process the image.')
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size < 4 * 1024 * 1024) return new File([blob], 'instagram.jpg', { type: 'image/jpeg' })
    }
    throw new Error('Image is still too large after optimizing.')
  } finally {
    bitmap.close()
  }
}
