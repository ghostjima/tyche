import { afterEach, describe, expect, it, vi } from "vitest";
import { REQUESTS_KEY, cancelRequest, findRequest, loadRequests, recordRequest, resetRequestsForTests } from "./requests";

/** A storage that holds strings, or throws on every call when blocked. */
function storage(blocked = false) {
  const data = new Map<string, string>();
  const check = () => {
    if (blocked) throw new Error("blocked");
  };
  return {
    getItem: (k: string) => (check(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (check(), void data.set(k, v)),
    data,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetRequestsForTests();
});

describe("redemption requests, recorded in this browser only", () => {
  it("are recorded once per issue and offer, kept in storage, and cancelled", () => {
    const s = storage();
    vi.stubGlobal("localStorage", s);
    recordRequest({ id: "KAMF-01", offerDate: "2027-08-29", bonds: 30 });
    recordRequest({ id: "KAMF-01", offerDate: "2027-08-29", bonds: 40 });
    const all = recordRequest({ id: "VTKT-02", offerDate: "2026-12-11", bonds: 5 });
    expect(all).toHaveLength(2);
    expect(findRequest(all, "KAMF-01", "2027-08-29")?.bonds).toBe(40);
    expect(JSON.parse(s.data.get(REQUESTS_KEY)!)).toHaveLength(2);
    // A new page reads them back.
    resetRequestsForTests();
    expect(loadRequests()).toEqual(all);
    expect(cancelRequest({ id: "KAMF-01", offerDate: "2027-08-29" })).toEqual([{ id: "VTKT-02", offerDate: "2026-12-11", bonds: 5 }]);
  });

  it("last as long as the page when storage is blocked, and ignore what is not a request", () => {
    vi.stubGlobal("localStorage", storage(true));
    expect(loadRequests()).toEqual([]);
    expect(recordRequest({ id: "KAMF-01", offerDate: "2027-08-29", bonds: 1 })).toHaveLength(1);
    expect(loadRequests()).toHaveLength(1);
    resetRequestsForTests();
    const s = storage();
    s.data.set(REQUESTS_KEY, JSON.stringify([{ id: "A-01", offerDate: "2027-01-01", bonds: 0 }, "x", { id: "B-01", offerDate: "2027-01-01", bonds: 2 }]));
    vi.stubGlobal("localStorage", s);
    expect(loadRequests()).toEqual([{ id: "B-01", offerDate: "2027-01-01", bonds: 2 }]);
  });
});
