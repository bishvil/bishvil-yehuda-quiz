import type { NextRequest } from "next/server";

import { POST_QUESTION_IMAGE_UPLOAD } from "../upload-handler";

export function POST(request: NextRequest) {
  return POST_QUESTION_IMAGE_UPLOAD(request);
}
