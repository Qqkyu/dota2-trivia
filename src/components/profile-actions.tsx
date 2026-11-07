"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/i18n/provider";

export function ProfileActions({ signOutFailed = false }: { signOutFailed?: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  async function deleteProfile() {
    if (!window.confirm(t("profile.deleteConfirm"))) return;
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
        <button type="submit">{t("profile.signOut")}</button>
      </form>
      {signOutFailed && <small role="alert">{t("profile.signOutFailed")}</small>}
      <button type="button" data-danger="true" onClick={() => void deleteProfile()} disabled={deleting}>
        {deleting ? t("profile.deleting") : t("profile.delete")}
      </button>
      {error && <small role="alert">{t("profile.deleteFailed")}</small>}
    </div>
  );
}
