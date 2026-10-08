const GUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;
const RESERVED_ID_PREFIX = /^(?:account|user|session|steam):/i;

/** Guest input cannot claim a server-owned account identity. */
export function validatedGuestIdentity(value) {
  if (typeof value !== "string") return null;
  const identity = value.trim();
  return GUEST_ID_PATTERN.test(identity) && !RESERVED_ID_PREFIX.test(identity) ? identity : null;
}
