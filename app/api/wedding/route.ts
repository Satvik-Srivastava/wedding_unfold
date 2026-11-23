import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseWeddingSettings } from "@/lib/wedding";
import { getSupabaseServerConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function databaseClient(accessToken?: string) {
  const { url, anonKey } = getSupabaseServerConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const supabase = databaseClient();
    const { data, error } = await supabase.from("wedding_settings").select("config").eq("id", "main").maybeSingle();
    if (error) {
      console.error("Could not load wedding settings:", error.message);
      return errorResponse("Wedding details could not be loaded. Check the Supabase table and public read policy.", 502);
    }
    if (!data) {
      return errorResponse("This wedding invitation hasn't been published yet. Please ask the hosts to complete the admin setup.", 404);
    }

    try {
      return NextResponse.json(parseWeddingSettings(data.config));
    } catch (validationError) {
      console.error("Stored wedding settings are invalid:", validationError);
      return errorResponse("Saved wedding details are invalid. Please review them in the admin page.", 500);
    }
  } catch (error) {
    console.error("Could not connect to Supabase:", error);
    return errorResponse(error instanceof Error ? error.message : "Wedding details could not be loaded.", 503);
  }
}

export async function PUT(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("Sign in to save wedding details.", 401);

  let supabase: ReturnType<typeof databaseClient>;
  try {
    supabase = databaseClient(accessToken);
  } catch (error) {
    console.error("Could not connect to Supabase:", error);
    return errorResponse(error instanceof Error ? error.message : "Wedding details could not be saved.", 503);
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !userData.user) return errorResponse("Your admin session has expired. Sign in again.", 401);
  if (userData.user.app_metadata.role !== "wedding_admin") {
    return errorResponse("This account does not have permission to change the wedding invitation.", 403);
  }

  let config;
  try {
    config = parseWeddingSettings(await request.json() as unknown);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Wedding details are invalid.", 400);
  }

  const { error } = await supabase.from("wedding_settings").upsert({ id: "main", config }, { onConflict: "id" });
  if (error) {
    console.error("Could not save wedding settings:", error.message);
    return errorResponse("Wedding details could not be saved. Check the Supabase table and admin write policy.", 502);
  }

  return NextResponse.json({ saved: true });
}
