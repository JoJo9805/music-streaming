"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

let signingOut = false;

export function UnauthorizedSync() {
  useEffect(() => {
    async function handleUnauthorized() {
      if (signingOut) return;
      signingOut = true;
      await signOut({ callbackUrl: "/login" });
    }

    window.addEventListener("melodymix:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("melodymix:unauthorized", handleUnauthorized);
  }, []);

  return null;
}
