import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { userClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirect";

// Email templates that use {{ .TokenHash }} (invite, magic link, recovery) land here.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "invite" || type === "recovery" ? "/account?reset=1" : "/";
  if (token_hash && type) {
    const supabase = await userClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next"), fallback), url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
