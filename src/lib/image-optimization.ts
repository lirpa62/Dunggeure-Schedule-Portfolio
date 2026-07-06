import "server-only";

import sharp from "sharp";

const WEBP_QUALITY = 82;

type OptimizeOptions = {
  maxWidth: number;
  maxHeight: number;
};

export function canConvertToWebp(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

export async function fileToBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}

export async function convertImageToWebp(
  file: File,
  options: OptimizeOptions,
) {
  const buffer = await fileToBuffer(file);
  const webp = await sharp(buffer)
    .rotate()
    .resize({
      width: options.maxWidth,
      height: options.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  return {
    buffer: webp,
    contentType: "image/webp",
    extension: "webp",
  };
}
