import { NextResponse } from "next/server";

import { PRIVATE_NO_STORE_HEADER, WRITE_NO_STORE_HEADER } from "@/src/lib/constants";

export function noStoreJson<TBody>(
  body: TBody,
  init?: { status?: number; cacheControl?: string },
): NextResponse<TBody> {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      "Cache-Control": init?.cacheControl ?? WRITE_NO_STORE_HEADER,
    },
  });
}

export function privateNoStoreJson<TBody>(
  body: TBody,
  init?: { status?: number },
): NextResponse<TBody> {
  return noStoreJson(body, {
    status: init?.status,
    cacheControl: PRIVATE_NO_STORE_HEADER,
  });
}
