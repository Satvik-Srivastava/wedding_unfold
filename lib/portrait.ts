export type PortraitPerson = "bride" | "groom";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 800;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function decodeImage(file: Blob) {
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
      image.onerror = () => reject(new Error("The generated portrait could not be decoded."));
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

function validateUpload(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo to create the illustration.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }
}

export async function generateWeddingPortrait(file: File, person: PortraitPerson, accessToken: string): Promise<string> {
  validateUpload(file);

  const form = new FormData();
  form.append("image", file);
  form.append("person", person);

  const response = await fetch("/api/portrait", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload ? String(payload.error) : "The portrait could not be generated.";
    throw new Error(message);
  }
  if (typeof payload !== "object" || payload === null || !("image" in payload) || typeof payload.image !== "string" || !payload.image.startsWith("data:image/")) {
    throw new Error("The image service returned an invalid portrait. Please try again.");
  }

  const responseImage = await fetch(payload.image);
  if (!responseImage.ok) throw new Error("The generated portrait could not be prepared for your invitation.");
  const image = await decodeImage(await responseImage.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the generated portrait.");

    context.fillStyle = "#fffaf0";
    context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const scale = Math.min(PREVIEW_WIDTH / image.width, PREVIEW_HEIGHT / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image.source, (PREVIEW_WIDTH - width) / 2, (PREVIEW_HEIGHT - height) / 2, width, height);

    context.strokeStyle = "#8b302b";
    context.lineWidth = 3;
    context.strokeRect(25, 25, PREVIEW_WIDTH - 50, PREVIEW_HEIGHT - 50);
    context.strokeStyle = "#d4a84e";
    context.lineWidth = 2;
    context.strokeRect(31, 31, PREVIEW_WIDTH - 62, PREVIEW_HEIGHT - 62);
    return canvas.toDataURL("image/jpeg", 0.84);
  } finally {
    image.release();
  }
}
