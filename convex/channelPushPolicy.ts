/** Pure claim rules for the daily Telegram channel post. */

export type ChannelPushClaimRow = {
  lastPostedDate?: string;
  claimedAt?: number;
  claimToken?: string;
  sendConfirmed?: boolean;
};

export type ChannelClaimDecision =
  | { claimed: false }
  | {
      claimed: true;
      resumeComplete: true;
      lastPostedDate: string;
      claimedAt: number;
      claimToken: string;
    }
  | {
      claimed: true;
      resumeComplete?: false;
      lastPostedDate: string;
      claimedAt: number;
    };

export function newChannelClaimToken(): string {
  return crypto.randomUUID();
}

/**
 * One in-flight claim at a time. A confirmed send (Telegram ack or ambiguous
 * timeout) cannot be reclaimed for another send; stale unconfirmed claims can.
 */
export function decideClaimChannelPush(
  row: ChannelPushClaimRow | null | undefined,
  args: { date: string; nowMs: number; staleAfterMs: number },
): ChannelClaimDecision {
  if (row == null) return { claimed: false };
  if (row.lastPostedDate === args.date && row.sendConfirmed) {
    if (row.claimedAt != null && row.claimToken) {
      return {
        claimed: true,
        resumeComplete: true,
        lastPostedDate: args.date,
        claimedAt: row.claimedAt,
        claimToken: row.claimToken,
      };
    }
    return { claimed: false };
  }
  if (row.lastPostedDate === args.date) {
    if (row.claimedAt == null) return { claimed: false };
    if (args.nowMs - row.claimedAt < args.staleAfterMs) {
      return { claimed: false };
    }
  }
  return {
    claimed: true,
    lastPostedDate: args.date,
    claimedAt: args.nowMs,
  };
}

export function ownsChannelClaim(
  row: ChannelPushClaimRow | null | undefined,
  args: { date: string; claimToken: string },
): row is ChannelPushClaimRow & { lastPostedDate: string; claimToken: string } {
  return (
    row != null &&
    row.lastPostedDate === args.date &&
    row.claimToken === args.claimToken
  );
}
