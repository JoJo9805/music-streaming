import { QueryClient } from "@tanstack/react-query";

// Singleton QueryClient shared between Providers and Zustand stores.
// Creating it at module level means the same instance is reused on the
// client (React re-renders don't create a new one) while SSR gets its own
// instance per request (Next.js module cache is per-request in server
// components, but this file is only ever imported in "use client" trees).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
