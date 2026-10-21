import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await userClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
