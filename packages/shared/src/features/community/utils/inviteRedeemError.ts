/**
 * Plain-language copy for `redeem_community_invite` failures. The RPC raises
 * distinct messages for each case, but shown raw they read like database
 * errors. Pure — shared by the desktop/web and mobile invite screens.
 */

const messageOf = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") return message;
  }
  return "";
};

export function describeInviteRedeemError(error: unknown): string {
  const message = messageOf(error).trim();
  const normalized = message.toLowerCase();

  if (normalized.includes("has expired")) {
    return "This invite has expired. Ask for a new link.";
  }
  if (normalized.includes("max uses")) {
    return "This invite has been used up. Ask for a new link.";
  }
  if (normalized.includes("invalid or inactive")) {
    return "That invite isn't valid anymore. Check the code or ask for a new link.";
  }
  // Anything else (a ban, a network failure) is more useful shown as-is.
  return message || "Couldn't join that community.";
}
