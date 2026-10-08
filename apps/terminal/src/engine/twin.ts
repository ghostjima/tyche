// The TypeScript twin of tyche-yield behind the Engine contract. It needs
// no loading, so it is always there.
import { calculate, derive_bond, explain, g_spread, order_ticket, portfolio_tax, price_from_yield, ytm_effective } from "@tyche/yield-twin";
import type { Engine } from "./types";

export const twinEngine: Engine = {
  kind: "twin",
  derive_bond,
  calculate,
  explain,
  g_spread,
  order_ticket,
  price_from_yield,
  ytm_effective,
  portfolio_tax,
};
