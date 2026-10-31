"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/**
 * Rendered inside a Next `Link`: shows `pending` instead of `children` while
 * the navigation is in flight, so a slow route (the profile reads the session,
 * the account and the room records first) answers the click at once instead
 * of inviting a second one. The wrapper keeps the same box either way.
 */
export function LinkStatusLabel({ children, pending }: { children: ReactNode; pending: ReactNode }) {
  const { pending: isPending } = useLinkStatus();
  return (
    <span data-link-pending={isPending ? "true" : "false"} aria-busy={isPending || undefined}>
      {isPending ? pending : children}
    </span>
  );
}
