import { handlePasswordSignIn } from "@/src/lib/auth/signin";

export async function POST(request: Request) {
  return handlePasswordSignIn(request, "host");
}
