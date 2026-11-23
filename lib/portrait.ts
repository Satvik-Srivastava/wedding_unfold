const WIDTH = 640;
const HEIGHT = 800;

const palette = [
  [88, 42, 37],
  [132, 67, 45],
  [177, 108, 65],
  [216, 164, 104],
  [242, 219, 174],
];

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

    context.filter = "grayscale(100%) contrast(1.12) brightness(1.04)";
    context.drawImage(image.source, sx, sy, sw, sh, inset, inset, frameWidth, frameHeight);
    context.filter = "none";
    const pixels = context.getImageData(inset, inset, frameWidth, frameHeight);
    const source = new Uint8ClampedArray(pixels.data);
    const width = frameWidth;
    const height = frameHeight;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const current = source[index] * 0.299 + source[index + 1] * 0.587 + source[index + 2] * 0.114;
        const leftIndex = y * width + Math.max(0, x - 1);
        const aboveIndex = Math.max(0, y - 1) * width + x;
        const left = source[leftIndex * 4];
        const above = source[aboveIndex * 4];
        const edge = Math.abs(current - left) + Math.abs(current - above) > 68;
        const shade = Math.min(palette.length - 1, Math.floor(current / 52));
        const color = palette[edge ? 0 : shade];
        pixels.data[index] = color[0];
        pixels.data[index + 1] = color[1];
        pixels.data[index + 2] = color[2];
        pixels.data[index + 3] = 255;
      }
    }
    context.putImageData(pixels, inset, inset);

    context.strokeStyle = "#8b302b";
    context.lineWidth = 3;
    context.strokeRect(25, 25, WIDTH - 50, HEIGHT - 50);
    context.strokeStyle = "#d4a84e";
    context.lineWidth = 2;
    context.strokeRect(31, 31, WIDTH - 62, HEIGHT - 62);
    context.fillStyle = "#d08a31";
    for (const [x, y] of [[32, 32], [WIDTH - 32, 32], [32, HEIGHT - 32], [WIDTH - 32, HEIGHT - 32]]) {
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }

    return canvas.toDataURL("image/jpeg", 0.84);
  } finally {
    image.release();
  }
}
