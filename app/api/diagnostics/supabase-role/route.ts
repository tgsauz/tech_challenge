import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

function isAuthorized(request: Request): boolean {
  const debugEnabled = process.env.DEBUG_SUPABASE_ROLE === "1";
  if (debugEnabled) return true;

  const expected = process.env.DEBUG_SUPABASE_ROLE_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("x-debug-secret");
  return Boolean(provided && provided === expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("whoami");
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const keyParts = rawKey.split(".");
  const keyMeta = {
    has_key: rawKey.length > 0,
    looks_like_jwt: keyParts.length === 3 && rawKey.startsWith("eyJ"),
    key_length: rawKey.length
  };

  if (error) {
    return NextResponse.json(
      { error: error.message, details: error, key_meta: keyMeta },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, key_meta: keyMeta });
}
