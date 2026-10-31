import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

/** Validates the session cookie against the database (once per request). */
export const getSession = cache(
  async () => await auth.api.getSession({ headers: await headers() }),
);

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
}

export async function redirectIfSignedIn() {
  if (await getSession()) {
    redirect("/chat");
  }
}
