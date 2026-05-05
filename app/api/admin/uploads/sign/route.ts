import type { NextRequest } from "next/server";

import { handleAdminUploadSign } from "./sign-handler";

export function POST(request: NextRequest) {
  return handleAdminUploadSign(request);
}
