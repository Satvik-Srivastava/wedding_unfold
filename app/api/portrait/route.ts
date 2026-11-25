import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerConfig } from "@/lib/supabase";
import type { PortraitPerson } from "@/lib/portrait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MODEL = "gpt-image-2.6-sunburst";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function portraitPrompt(person: PortraitPerson) {
  const subject = person === "bride" ? "Indian bride" : "Indian groom";
  const clothing = person === "bride"
    ? "wearing elegant traditional Indian bridal attire: a richly embroidered deep rose or muted maroon lehenga or sari, a graceful dupatta, and refined gold jewellery including tasteful earrings and a maang tikka"
    : "wearing elegant traditional Indian groom attire: an ivory or warm cream sherwani with intricate muted-gold embroidery and refined traditional accessories";

  return [
    "Edit the single uploaded photograph into one polished, elegant hand-drawn Indian wedding invitation illustration.",
    `Show exactly one adult person: the ${subject}, ${clothing}. Never add a partner, another person, or a couple.`,
    "Use the uploaded photograph as the sole and highest-priority identity reference. Preserve this person's recognizable face: face shape, eyes, eyebrows, nose, lips, skin tone, age, hairstyle, and distinctive features. Do not substitute a generic face, alter their identity, exaggerate features, or lighten their skin.",
    "Blend the face naturally into the illustrated hair, neck, clothing, and body. Render the entire image in one consistent, refined illustration style: clean delicate ink outlines, soft digital watercolor and gouache shading, natural skin highlights, gentle tonal transitions, detailed fabric and jewellery, believable anatomy, and elegant restrained color.",
    "Premium hand-drawn Indian wedding invitation art, with a warm ivory background and subtle rose and antique-gold accents. Waist-up portrait, centered, portrait composition, both shoulders and traditional outfit clearly visible.",
    "The face must also be illustrated, never photorealistic. No photo-real face on an illustrated body, no 3D render, no anime, no exaggerated eyes, no text, no typography, no watermark, no frame.",
  ].join(" ");
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("Sign in as the wedding admin to generate portraits.", 401);

  let supabase;
  try {
    const { url, anonKey } = getSupabaseServerConfig();
    supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  } catch (error) {
    console.error("Could not verify portrait admin:", error);
    return errorResponse("Supabase authentication is not configured.", 503);
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !userData.user) return errorResponse("Your admin session has expired. Sign in again.", 401);
  if (userData.user.app_metadata.role !== "wedding_admin") {
    return errorResponse("This account does not have permission to generate wedding portraits.", 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Upload a JPEG, PNG, or WebP photo to create a portrait.", 400);
  }

  const file = form.get("image");
  const personValue = form.get("person");
  if (!(file instanceof File)) return errorResponse("Choose a photo for the bride or groom.", 400);
  if (personValue !== "bride" && personValue !== "groom") return errorResponse("Choose whether this photo is for the bride or groom.", 400);
  const person: PortraitPerson = personValue;
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return errorResponse("Choose a JPEG, PNG, or WebP photo.", 415);
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return errorResponse("Choose a non-empty image smaller than 10 MB.", 413);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errorResponse("Portrait generation is not configured. Add OPENAI_API_KEY to the server environment.", 503);

  try {
    const imageUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        images: [{ image_url: imageUrl }],
        prompt: portraitPrompt(person),
        n: 1,
        size: "1024x1536",
        output_format: "jpeg",
        output_compression: 85,
        moderation: "auto",
      }),
      cache: "no-store",
    });

    const result: unknown = await upstream.json();
    if (!upstream.ok) {
      const providerMessage = typeof result === "object" && result !== null && "error" in result &&
        typeof result.error === "object" && result.error !== null && "message" in result.error
        ? String(result.error.message)
        : "The image service could not create this portrait.";
      console.error("OpenAI portrait generation failed:", upstream.status, providerMessage);
      const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 422;
      return errorResponse(
        upstream.status === 429
          ? "Image generation is temporarily rate-limited. Please wait a moment and try again."
          : upstream.status >= 500
            ? "The image service is temporarily unavailable. Please try again shortly."
            : "The image service could not create this portrait. Try a clear, well-lit photo of one person.",
        status,
      );
    }

    const imageData = typeof result === "object" && result !== null && "data" in result && Array.isArray(result.data)
      ? result.data[0]
      : null;
    const image = typeof imageData === "object" && imageData !== null && "b64_json" in imageData && typeof imageData.b64_json === "string"
      ? imageData.b64_json
      : null;
    if (!image) {
      console.error("OpenAI portrait response did not contain an image.");
      return errorResponse("The image service returned no portrait. Please try again.", 502);
    }

    return NextResponse.json(
      { image: `data:image/jpeg;base64,${image}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not reach OpenAI portrait service:", error);
    return errorResponse("The image service could not be reached. Check the server connection and try again.", 502);
  }
}
