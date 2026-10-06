// The TypeScript twin of tyche-yield behind the Engine contract. It needs
// no loading, so it is always there.
import { calculate, derive_bond, price_from_yield } from "@tyche/yield-twin";
import type { Engine } from "./types";

export const twinEngine: Engine = {
  kind: "twin",
  derive_bond,
  calculate,
  price_from_yield,
};
