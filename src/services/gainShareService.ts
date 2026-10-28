// The gain share (backend changesets 114–115): after a buyer leaves a flexible
// plan (or the developer ends it), HomeTrue sells the plot again; if it sells
// for more than the buyer's agreed price, the buyer gets their declared share
// of the difference, paid after the developer's payout from that sale.
//
// Every figure is the backend's. There is no "paid" status: a share paid in
// full stays `owed` with `paid` equal to `amount`. `no_gain` can still carry a
// positive `gain` (nothing was left of the developer's payout to share), so
// screens word it from `status`, never from `gain`.

import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";

export interface GainShare {
  id: string;
  // The purchase the buyer left (its transaction id).
  purchaseId: string;
  // open: waiting for the plot's next sale. owed: it sold for more. no_gain: nothing to share.
  status: "open" | "owed" | "no_gain";
  agreedPrice: number;
  currency: string;
  yourSharePct: number;
  openedAt: string;
  // Once the plot has sold again:
  salePrice: number | null;
  gain: number | null;
  amount: number | null;
  settledAt: string | null;
  // What has reached the buyer so far.
  paid: number;
  // True when an owed share needs a bank account to be sent.
  accountNeeded: boolean;
  account: { bankName: string; accountLast4: string; accountName: string } | null;
}

export async function fetchGainShares(): Promise<GainShare[]> {
  if (isMock("checkout")) return [];
  return apiClient.get<GainShare[]>("/api/gain-shares");
}

// Where to send an owed share; the bank supplies the name. Replaceable until a
// transfer of it starts (409 GAIN_SHARE_ALREADY_SENDING; GAIN_SHARE_NOT_OWED
// before the plot has sold for more).
export async function saveGainShareAccount(id: string, account: { bankCode: string; accountNumber: string }): Promise<GainShare> {
  return apiClient.put<GainShare>(`/api/gain-shares/${encodeURIComponent(id)}/account`, account);
}

export type GainShareState = "waiting" | "account_needed" | "on_its_way" | "paid" | "nothing";

export function gainShareState(g: GainShare): GainShareState {
  if (g.status === "open") return "waiting";
  if (g.status === "no_gain") return "nothing";
  if (g.amount !== null && g.paid >= g.amount) return "paid";
  return g.accountNeeded && !g.account ? "account_needed" : "on_its_way";
}
