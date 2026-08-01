"use client";

import { useState } from "react";

export function ProfileActions() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  async function deleteProfile() {
    if (!window.confirm("Delete your Queue Arcade profile and every saved result? This cannot be undone.")) return;
    setDeleting(true);
    setError(false);
    try {
      const response = await fetch("/api/me", { method: "DELETE" });
      if (!response.ok) throw new Error("Profile deletion failed.");
      window.location.assign("/");
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
      <button type="button" data-danger="true" onClick={() => void deleteProfile()} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete profile"}
      </button>
      {error && <small role="alert">Couldn’t delete the profile. Try again.</small>}
    </div>
  );
}
