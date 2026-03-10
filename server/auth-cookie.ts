import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const PREVIEW_SESSION_COOKIE = "rcc_preview_token";
export const PREVIEW_SESSION_MAX_AGE_SECONDS = 72 * 60 * 60;

function isSecureRequest(c: Context) {
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto === "https";
  return new URL(c.req.url).protocol === "https:";
}

export function setPreviewSessionCookie(c: Context, token: string) {
  setCookie(c, PREVIEW_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: PREVIEW_SESSION_MAX_AGE_SECONDS,
    secure: isSecureRequest(c),
  });
}

export function clearPreviewSessionCookie(c: Context) {
  deleteCookie(c, PREVIEW_SESSION_COOKIE, { path: "/" });
}
