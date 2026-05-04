import { handleImportUrl } from "./import-url-handler";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return handleImportUrl(body);
}
