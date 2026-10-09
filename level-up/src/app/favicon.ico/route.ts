import { NextResponse, type NextRequest } from "next/server";

// Browsers ask for /favicon.ico by default; the icon is an SVG (app/icon.svg), so point them at it.
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/icon.svg", req.url), 308);
}
