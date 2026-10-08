// Demo orders confirmed at the order ticket, recorded in this browser
// only: the terminal sends nothing anywhere and places no order. One
// record per issue, the last one confirmed, which can be deleted. Storage
// can be blocked or cleared; then the records last as long as the page.
import type { OrderSide } from "../data/depth";

export type DemoOrder = {
  /** The issue's ticker. */
  id: string;
  side: OrderSide;
  lots: number;
  bonds: number;
  /** The limit's clean price, percent of face. */
  pricePct: number;
  /** What the buyer pays or the seller receives, with the fee. */
  total: number;
};

export const ORDERS_KEY = "tyche.demoOrders";

let memory: DemoOrder[] | null = null;

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function valid(x: unknown): x is DemoOrder {
  const o = x as DemoOrder;
  return (
    typeof o === "object" &&
    o !== null &&
    typeof o.id === "string" &&
    (o.side === "buy" || o.side === "sell") &&
    Number.isInteger(o.lots) &&
    o.lots > 0 &&
    Number.isInteger(o.bonds) &&
    o.bonds > 0 &&
    finite(o.pricePct) &&
    o.pricePct > 0 &&
    finite(o.total)
  );
}

/** The demo orders recorded in this browser. */
export function loadOrders(): DemoOrder[] {
  if (memory) return memory;
  try {
    const raw = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]") as unknown;
    memory = Array.isArray(raw) ? raw.filter(valid) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function save(all: DemoOrder[]): DemoOrder[] {
  memory = all;
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: kept for the page only.
  }
  return all;
}

/** Records a demo order, replacing the issue's last one. */
export function recordOrder(o: DemoOrder): DemoOrder[] {
  return save([...loadOrders().filter((x) => x.id !== o.id), o]);
}

/** Deletes the issue's record. */
export function deleteOrder(id: string): DemoOrder[] {
  return save(loadOrders().filter((x) => x.id !== id));
}

export function findOrder(all: readonly DemoOrder[], id: string): DemoOrder | undefined {
  return all.find((x) => x.id === id);
}

/** For tests: forgets what the module holds, so storage is read again. */
export function resetOrdersForTests(): void {
  memory = null;
}
