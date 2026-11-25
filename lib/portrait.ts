const WIDTH = 640;
const HEIGHT = 800;

export function inkWash(source: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || source.length !== width * height * 4) {
    throw new Error("The portrait image data is invalid.");
  }

  const result = new Uint8ClampedArray(source);
  const luminance = new Float32Array(width * height);
  const tones = [30, 52, 76, 101, 128, 155, 181, 207, 231, 248];

  for (let pixel = 0; pixel < luminance.length; pixel++) {
    const index = pixel * 4;
    luminance[pixel] = source[index] * 0.2126 + source[index + 1] * 0.7152 + source[index + 2] * 0.0722;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const index = pixel * 4;
      const current = luminance[pixel];
      const left = luminance[y * width + Math.max(0, x - 1)];
      const right = luminance[y * width + Math.min(width - 1, x + 1)];
      const above = luminance[Math.max(0, y - 1) * width + x];
      const below = luminance[Math.min(height - 1, y + 1) * width + x];
      const edgeStrength = Math.abs(right - left) + Math.abs(below - above);
      const tone = tones.reduce((nearest, value) => (Math.abs(value - current) < Math.abs(nearest - current) ? value : nearest), tones[0]);
      const factor = current > 1 ? tone / current : 1;
      const grain = Math.sin(x * 0.17 + y * 0.11) * 1.2;
      const ink = Math.min(0.7, Math.max(0, (edgeStrength - 78) / 170));

      result[index] = (source[index] * factor + grain + 5) * (1 - ink) + 77 * ink;
      result[index + 1] = (source[index + 1] * factor + grain + 1) * (1 - ink) + 45 * ink;
      result[index + 2] = (source[index + 2] * factor + grain - 4) * (1 - ink) + 40 * ink;
      result[index + 3] = 255;
    }
  }

  return result;
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Older browsers can still decode the image element path below.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The source image could not be decoded."));
      image.src = url;
    });
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function makeHandDrawnPortrait(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file to create a portrait.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");

  const image = await decodeImage(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Your browser could not prepare the portrait canvas.");

    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const inset = 38;
    const frameWidth = WIDTH - inset * 2;
    const frameHeight = HEIGHT - inset * 2;
    const sourceRatio = image.width / image.height;
    const targetRatio = frameWidth / frameHeight;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (sourceRatio > targetRatio) {
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }

    context.filter = "saturate(1.12) contrast(1.08) brightness(1.02)";
    context.drawImage(image.source, sx, sy, sw, sh, inset, inset, frameWidth, frameHeight);
    context.filter = "none";
    const pixels = context.getImageData(inset, inset, frameWidth, frameHeight);
    pixels.data.set(inkWash(pixels.data, frameWidth, frameHeight));
    context.putImageData(pixels, inset, inset);

    context.strokeStyle = "#8b302b";
    context.lineWidth = 3;
    context.strokeRect(25, 25, WIDTH - 50, HEIGHT - 50);
    context.strokeStyle = "#d4a84e";
    context.lineWidth = 2;
    context.strokeRect(31, 31, WIDTH - 62, HEIGHT - 62);
    for (let x = 42; x <= WIDTH - 42; x += 24) {
      for (const y of [42, HEIGHT - 42]) {
        context.fillStyle = (x / 24) % 2 < 1 ? "#d08a31" : "#b87935";
        context.beginPath();
        context.arc(x, y, 1.4, 0, Math.PI * 2);
        context.fill();
      }
    }

    return canvas.toDataURL("image/jpeg", 0.84);
  } finally {
    image.release();
  }
}
