import type { AuthRole } from "@/src/lib/constants";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { writeLog } from "@/src/lib/logging";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

import { passwordSignInRequestSchema } from "./validation";

interface SignInSuccessBody {
  role: "host" | "admin";
  userId: string;
  email: string;
}

interface SignInErrorBody {
  error: "INVALID_REQUEST" | "INVALID_CREDENTIALS" | "FORBIDDEN";
  message: string;
}

type SignInResponseBody = SignInSuccessBody | SignInErrorBody;

export async function handlePasswordSignIn(
  request: Request,
  expectedRole: Extract<AuthRole, "host" | "admin">,
) {
  const parsedBody = passwordSignInRequestSchema.safeParse(await request.json());

  if (!parsedBody.success) {
    return privateNoStoreJson<SignInResponseBody>(
      {
        error: "INVALID_REQUEST",
        message: "Email and password are required.",
      },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsedBody.data);

  if (error || !data.user) {
    writeLog({
      level: "warn",
      message: "Password sign-in failed",
      context: { expectedRole },
    });

    return privateNoStoreJson<SignInResponseBody>(
      {
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
      { status: 401 },
    );
  }

  if (data.user.app_metadata.role !== expectedRole) {
    await supabase.auth.signOut();

    return privateNoStoreJson<SignInResponseBody>(
      {
        error: "FORBIDDEN",
        message: `Expected ${expectedRole} credentials.`,
      },
      { status: 403 },
    );
  }

  return privateNoStoreJson<SignInResponseBody>({
    role: expectedRole,
    userId: data.user.id,
    email: data.user.email ?? parsedBody.data.email,
  });
}
