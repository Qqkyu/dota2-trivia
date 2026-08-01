import Image from "next/image";

const STEAM_SIGN_IN_IMAGE = "/assets/steam-sign-in.png";

export function SteamSignIn({ returnTo = "/profile", className }: { returnTo?: string; className?: string }) {
  const href = `/api/auth/steam?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <a href={href} className={className} data-testid="steam-sign-in" aria-label="Sign in through Steam">
      <Image src={STEAM_SIGN_IN_IMAGE} alt="Sign in through Steam" width={180} height={35} priority />
    </a>
  );
}
