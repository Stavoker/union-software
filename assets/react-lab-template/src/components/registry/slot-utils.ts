export function resolveSlotSrc(src: string) {
  return src.startsWith("./") ? src : `./img/${src}`;
}

export function resolveSlotImages(images: string[] | undefined, max: number) {
  return (Array.isArray(images) ? images : []).slice(0, max);
}
