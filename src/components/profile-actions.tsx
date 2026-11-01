"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileActions({ signOutFailed = false }: { signOutFailed?: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  async function deleteProfile() {
    if (!window.confirm("Delete your Queue Arcade profile and every saved result? This cannot be undone.")) return;
    setDeleting(true);
    setError(false);
    try {
      const response = await fetch("/api/me", { method: "DELETE" });
      if (!response.ok) throw new Error("Profile deletion failed.");
      router.replace("/");
      router.refresh();
    } catch {
      setError(true);
      setDeleting(false);
    }
  }

  return (
    <div>
      <form action="/api/auth/logout" method="post">
        <button type="submit">Sign out</button>
      </form>
      {signOutFailed && <small role="alert">Couldn’t sign out. Try again.</small>}
      <button type="button" data-danger="true" onClick={() => void deleteProfile()} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete profile"}
      </button>
      {error && <small role="alert">Couldn’t delete the profile. Try again.</small>}
    </div>
  );
}
