"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { AudioProvider } from "./AudioProvider";
import { LibrarySync } from "./LibrarySync";
import { UnauthorizedSync } from "./UnauthorizedSync";
import { queryClient } from "@/lib/queryClient";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <LibrarySync />
        <UnauthorizedSync />
        <AudioProvider />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
