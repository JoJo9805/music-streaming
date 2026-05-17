"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { LogOut, User } from "lucide-react";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="px-4 py-3">
        <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="px-4 py-3">
        <Link href="/login">
          <Button variant="default" className="w-full rounded-lg">
            Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 px-2">
        <Link href="/profile" className="flex items-center gap-3 min-w-0 flex-1">
          {session.user.image ? (
            <img
              src={session.user.image}
              alt={session.user.name ?? "User"}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <User className="w-4 h-4 text-accent" />
            </div>
          )}
          <Typography variant="caption" className="font-semibold truncate flex-1">
            {session.user.name ?? session.user.email}
          </Typography>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-muted hover:text-foreground transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
