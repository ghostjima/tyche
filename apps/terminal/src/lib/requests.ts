// Requests to redeem a holding at a put offer, recorded in this browser
// only: the terminal sends nothing anywhere and places no order. A request
// is kept under the issue and its offer date, with the bonds it covers,
// and can be cancelled until the offer's window closes. Storage can be
// blocked or cleared; then the requests last as long as the page.

export type RedemptionRequest = { id: string; offerDate: string; bonds: number };

export const REQUESTS_KEY = "tyche.redemptionRequests";

const keyOf = (r: Pick<RedemptionRequest, "id" | "offerDate">) => `${r.id}@${r.offerDate}`;

let memory: RedemptionRequest[] | null = null;

function valid(x: unknown): x is RedemptionRequest {
  const r = x as RedemptionRequest;
  return typeof r === "object" && r !== null && typeof r.id === "string" && typeof r.offerDate === "string" && Number.isInteger(r.bonds) && r.bonds > 0;
}

/** The requests recorded in this browser. */
export function loadRequests(): RedemptionRequest[] {
  if (memory) return memory;
  try {
    const raw = JSON.parse(localStorage.getItem(REQUESTS_KEY) ?? "[]") as unknown;
    memory = Array.isArray(raw) ? raw.filter(valid) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function save(all: RedemptionRequest[]): RedemptionRequest[] {
  memory = all;
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: kept for the page only.
  }
  return all;
}

/** Records a request, replacing one for the same issue and offer. */
export function recordRequest(r: RedemptionRequest): RedemptionRequest[] {
  return save([...loadRequests().filter((x) => keyOf(x) !== keyOf(r)), r]);
}

/** Cancels the request for an issue and offer. */
export function cancelRequest(r: Pick<RedemptionRequest, "id" | "offerDate">): RedemptionRequest[] {
  return save(loadRequests().filter((x) => keyOf(x) !== keyOf(r)));
}

export function findRequest(all: readonly RedemptionRequest[], id: string, offerDate: string): RedemptionRequest | undefined {
  return all.find((x) => x.id === id && x.offerDate === offerDate);
}

/** For tests: forgets what the module holds, so storage is read again. */
export function resetRequestsForTests(): void {
  memory = null;
}
