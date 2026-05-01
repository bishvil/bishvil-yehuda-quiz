import type { NextRequest } from "next/server";

import { POST_LOGO_UPLOAD } from "../upload-handler";

export function POST(request: NextRequest) {
  return POST_LOGO_UPLOAD(request);
}
