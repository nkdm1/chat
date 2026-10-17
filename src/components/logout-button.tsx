"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function useSignOut() {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  };
}

export function LogoutButton({
  variant = "outline",
}: {
  variant?: "outline" | "ghost";
}) {
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
      }}
    >
      {pending && <Spinner />}
      Log out
    </Button>
  );
}
