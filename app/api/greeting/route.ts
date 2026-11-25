import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerConfig } from "@/lib/supabase";
import { parseWeddingSettings } from "@/lib/wedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12_000;
const MAX_NOTE_LENGTH = 1_000;
const MAX_NAME_LENGTH = 100;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const sendAttempts = new Map<string, number[]>();

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function rateLimitKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse("This greeting is too long to send.", 413);
  }

  const now = Date.now();
  const key = rateLimitKey(request);
  const recentAttempts = (sendAttempts.get(key) ?? []).filter((attempt) => now - attempt < RATE_LIMIT_WINDOW_MS);
  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    return errorResponse("Too many greetings were sent from this connection. Please try again later.", 429);
  }
  recentAttempts.push(now);
  sendAttempts.set(key, recentAttempts);
  if (sendAttempts.size > 500) {
    for (const [ip, attempts] of sendAttempts) {
      if (attempts.every((attempt) => now - attempt >= RATE_LIMIT_WINDOW_MS)) sendAttempts.delete(ip);
    }
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return errorResponse("This greeting is too long to send.", 413);
    }
    payload = JSON.parse(body) as unknown;
  } catch {
    return errorResponse("The greeting could not be read. Please review it and try again.", 400);
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return errorResponse("The greeting details are incomplete.", 400);
  }
  const data = payload as Record<string, unknown>;
  if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > MAX_NAME_LENGTH) {
    return errorResponse(`Enter a name of up to ${MAX_NAME_LENGTH} characters.`, 400);
  }
  if (!Array.isArray(data.events) || data.events.length === 0 || !data.events.every((event) => typeof event === "string")) {
    return errorResponse("Choose at least one celebration to send with your greeting.", 400);
  }
  if (!Number.isInteger(data.guests) || Number(data.guests) < 1 || Number(data.guests) > 12) {
    return errorResponse("Guest count must be between 1 and 12.", 400);
  }
  if (typeof data.note !== "string" || data.note.length > MAX_NOTE_LENGTH) {
    return errorResponse(`Keep your note to ${MAX_NOTE_LENGTH} characters or fewer.`, 400);
  }

  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const sharedSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
  if (!scriptUrl || !sharedSecret) {
    console.error("Greeting email is not configured. Set GOOGLE_APPS_SCRIPT_URL and GOOGLE_APPS_SCRIPT_SECRET.");
    return errorResponse("Greeting delivery is not set up yet. Please let the hosts know.", 503);
  }
  let scriptEndpoint: URL;
  try {
    scriptEndpoint = new URL(scriptUrl);
  } catch {
    console.error("Greeting email configuration contains an invalid Apps Script URL.");
    return errorResponse("Greeting delivery is not set up correctly. Please let the hosts know.", 503);
  }
  if (
    scriptEndpoint.protocol !== "https:" ||
    scriptEndpoint.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec\/?$/.test(scriptEndpoint.pathname) ||
    sharedSecret.length < 32
  ) {
    console.error("Greeting email configuration contains an invalid Apps Script URL or secret.");
    return errorResponse("Greeting delivery is not set up correctly. Please let the hosts know.", 503);
  }

  let wedding;
  try {
    const { url, anonKey } = getSupabaseServerConfig();
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: saved, error } = await supabase.from("wedding_settings").select("config").eq("id", "main").maybeSingle();
    if (error) {
      console.error("Could not load wedding details for greeting email:", error.message);
      return errorResponse("Your greeting could not be sent right now. Please try again later.", 502);
    }
    if (!saved) return errorResponse("The wedding invitation has not been published yet.", 503);
    wedding = parseWeddingSettings(saved.config);
  } catch (error) {
    console.error("Could not prepare greeting email:", error);
    return errorResponse("Your greeting could not be sent right now. Please try again later.", 503);
  }

  const selectedEvents = [...new Set(data.events as string[])];
  const eventNames = selectedEvents.map((eventKey) => wedding.events.find((event) => event.key === eventKey)?.name);
  if (eventNames.some((name) => !name)) {
    return errorResponse("One or more selected celebrations are no longer available. Refresh and try again.", 400);
  }

  const guestName = data.name.trim();
  const note = data.note.trim();
  try {
    const response = await fetch(scriptEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: sharedSecret,
        name: guestName,
        events: eventNames,
        guests: data.guests,
        note,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Google Apps Script could not deliver wedding greeting:", response.status);
      return errorResponse("Your greeting could not be delivered. Please try again later.", 502);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      console.error("Google Apps Script returned an unreadable response.");
      return errorResponse("Your greeting could not be delivered. Please try again later.", 502);
    }
    if (typeof result !== "object" || result === null || !("sent" in result) || result.sent !== true) {
      console.error("Google Apps Script did not confirm delivery.");
      return errorResponse("Your greeting could not be delivered. Please try again later.", 502);
    }
    return NextResponse.json({ sent: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not reach Google Apps Script for wedding greeting:", error);
    return errorResponse("Your greeting could not be delivered. Please try again later.", 502);
  }
}
