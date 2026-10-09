// The order ticket of an issue: buy or sell, a limit price in percent of
// face linked to its yield through the engine's order_ticket, the lots,
// the accrued interest and the total with the broker's fee, the yields at
// the limit price before and after the fee, a depth check against the
// synthetic order book, the qualification gate, and a confirmation. It is
// a demonstration: a confirmed ticket is recorded in this browser only,
// and nothing is sent anywhere.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  Button,
  ChoiceGroup,
  DescriptionList,
  Panel,
  PriceYieldField,
  QuantityStepper,
  RadioGroup,
  Skeleton,
  SkeletonLines,
  Table,
  focusWhenReady,
  useBreakpoint,
  type DescriptionItem,
  type PriceYieldResult,
  type PriceYieldStatus,
  type PriceYieldValue,
} from "@ghostjima/stoa-react";
import { pctToUnits, type Depth, type DepthQuery, type OrderSide } from "../data/depth";
import { INDEX_LAW, isIndexReason, reasonLevel, type Gate, type Gates } from "../data/gates";
import type { Bond } from "../data/issues";
import { MARKET, dayOf } from "../data/market";
import type { Derived, Engine, ErrorCode, LimitKind, Ticket } from "../engine/types";
import type { Strings } from "../i18n";
import { feeInRange } from "../lib/fee";
import type { Formats } from "../lib/format";
import { deleteOrder, findOrder, loadOrders, recordOrder, type DemoOrder } from "../lib/orders";
import {
  INVESTOR_STATUSES,
  PRICE_DECIMALS,
  YIELD_DECIMALS,
  defaultLots,
  fieldOf,
  gateVerdict,
  maxLots,
  shownAmounts,
  stepsAround,
  ticketOrder,
  type InvestorStatus,
} from "../lib/ticket";
import { useDepth } from "../market/useDepth";

/** The law the gate's rule is modelled on: the test for a non-qualified
 * investor, and the issues for qualified investors only. */
const SECURITIES_LAW = { number: "39", test: "3.1", qualified: "51.2" } as const;

export type OrderTicketProps = {
  t: Strings;
  f: Formats;
  bond: Bond;
  derived: Derived;
  engine: Engine;
  /** The issue's place in the universe, for the market worker's book. */
  index: number;
  gates: Gates;
  /** The session's broker's fee, percent. */
  feePct: number;
  /** Where the figures come from, at the top of the panel. */
  source: ReactNode;
};

/** A reason's words; those about the rating threshold take it. */
const reasonText = (words: string | ((rating: string) => string), rating: string) => (typeof words === "function" ? words(rating) : words);

/** Decimals of a price step in percent: 0.01 has 2. */
const stepDigits = (tickPct: number) => Math.max(0, Math.min(PRICE_DECIMALS, Math.round(-Math.log10(tickPct) + 0.5 - 1e-9)));

export function OrderTicket({ t, f, bond, derived, engine, index, gates, feePct, source }: OrderTicketProps) {
  const id = bond.id;
  const { issue } = bond;
  // On a phone each figure goes under its term.
  const layout = useBreakpoint() === "narrow" ? "stacked" : "columns";
  const [side, setSide] = useState<OrderSide>("buy");
  const [lots, setLots] = useState(() => defaultLots(bond.lot));
  const [status, setStatus] = useState<InvestorStatus>("unqualified");
  const [fieldStatus, setFieldStatus] = useState<PriceYieldStatus>("ready");
  const [confirming, setConfirming] = useState(false);
  const [orders, setOrders] = useState<DemoOrder[]>(loadOrders);
  // Whether the person has typed a limit: until then it follows the best
  // opposite price in the book.
  const typed = useRef(false);

  const order = (limit: LimitKind, limitValue: number, forSide: OrderSide, forLots: number) =>
    engine.order_ticket(issue, MARKET, ticketOrder({ side: forSide, limit, limitValue, lots: forLots, lotSize: bond.lot, tickPct: bond.tickPct, feePct }));
  const yieldAt = (pricePct: number): number | null => {
    const r = order("price", pricePct, side, 1);
    return "ok" in r ? Math.round(r.ok.yieldEvent * 100 * 10 ** YIELD_DECIMALS) / 10 ** YIELD_DECIMALS : null;
  };
  const [value, setValue] = useState<PriceYieldValue>(() => ({ price: issue.pricePct, yield: yieldAt(issue.pricePct), source: "price" }));

  // The book's best prices at the check's moment, once per issue: a check
  // of no bonds gives the best opposite price of each side.
  const quote = useDepth(useMemo<DepthQuery[]>(() => [
    { index, side: "buy", bonds: 0, limit: 0 },
    { index, side: "sell", bonds: 0, limit: 0 },
  ], [index]));
  const best = (s: OrderSide): number | null => (quote.status === "ready" ? (s === "buy" ? quote.depth[0]?.bestPct : quote.depth[1]?.bestPct) ?? null : null);

  // Until a limit is typed, it is the best opposite price: the best offer
  // for a buy, the best bid for a sale.
  useEffect(() => {
    if (typed.current) return;
    const price = best(side);
    if (price !== null) setValue({ price, yield: yieldAt(price), source: "price" });
    // yieldAt follows the side and the issue, both in the dependencies.
  }, [quote, side, engine]);

  const changeSide = (next: OrderSide) => {
    setSide(next);
    // A limit yield is put on the price step down for a buy and up for a
    // sale: the price follows the side.
    if (typed.current && value.source === "yield" && value.yield !== null) {
      const r = order("yield", value.yield, next, 1);
      setValue({ ...value, price: "ok" in r ? r.ok.cleanPct : null });
    }
  };

  const digits = stepDigits(bond.tickPct);
  const step = f.percent(bond.tickPct / 100, digits);
  /** An engine error under the field typed in, in words. */
  const limitWords = (code: ErrorCode, limit: LimitKind, typedValue: number): string => {
    switch (code) {
      case "invalid_limit":
        return limit === "price" ? t.ticketPriceZero : t.ticketYieldNoPrice(f.percent(-0.99, 0));
      case "price_off_tick": {
        const [below, above] = stepsAround(typedValue, bond.tickPct);
        return t.ticketOffTick(step, f.percent(below / 100, PRICE_DECIMALS), f.percent(above / 100, PRICE_DECIMALS));
      }
      case "invalid_tick":
        return t.ticketBadTick;
      default:
        return t.errors[code];
    }
  };
  const answer = (limit: LimitKind, typedValue: number): PriceYieldResult => {
    typed.current = true;
    const r = order(limit, typedValue, side, 1);
    if ("error" in r) return { error: limitWords(r.error, limit, typedValue) };
    return limit === "price" ? r.ok.yieldEvent * 100 : r.ok.cleanPct;
  };

  const feeOk = feeInRange(feePct);
  const limitValue = value[value.source];
  const result = feeOk && limitValue !== null ? order(value.source, limitValue, side, lots) : null;
  const ticket: Ticket | null = result && "ok" in result ? result.ok : null;
  const error = result && "error" in result ? result.error : null;

  const check = useDepth(useMemo<DepthQuery[] | null>(
    () => (ticket ? [{ index, side, bonds: ticket.bonds, limit: pctToUnits(ticket.cleanPct) }] : null),
    [index, side, ticket?.bonds, ticket?.cleanPct],
  ));
  const depth: Depth | null = check.status === "ready" ? (check.depth[0] ?? null) : null;

  const gate: Gate | undefined = gates.byTicker.get(id);
  const verdict = gate ? gateVerdict(gate.access, status, side) : null;

  const record = findOrder(orders, id);
  const reviewId = `ticket-review-${id}`;
  const deleteId = `ticket-delete-${id}`;
  const heldBecause = !feeOk
    ? t.ticketNeedFee
    : fieldStatus === "pending"
      ? t.ticketWaiting
      : !ticket
        ? t.ticketFixFirst
        : !verdict
          ? t.gateMissing
          : !verdict.allowed
            ? t.ticketGateHeld
            : null;

  const eventWords = (ticket?.event ?? derived.event) === "offer" ? t.ticketToOffer : t.ticketToMaturity;

  const shown = ticket ? shownAmounts(ticket, side) : null;
  const figures: DescriptionItem[] = ticket && shown
    ? [
        { id: "clean", term: t.ticketClean, description: `${f.percent(ticket.cleanPct / 100, PRICE_DECIMALS)} · ${f.money(ticket.clean)}`, numeric: true },
        { id: "accrued", term: t.ticketAccrued, description: f.money(ticket.accrued), numeric: true },
        { id: "dirty", term: t.ticketDirty, description: f.money(ticket.dirty), numeric: true },
        { id: "bonds", term: t.ticketBonds, description: f.integer(ticket.bonds), numeric: true },
        { id: "clean-amount", term: t.ticketCleanAmount, description: f.money(shown.clean), numeric: true },
        { id: "accrued-amount", term: t.ticketAccruedAmount, description: f.money(shown.accrued), numeric: true },
        { id: "amount", term: t.ticketAmount, description: f.money(shown.amount), numeric: true },
        { id: "fee", term: t.ticketFee(f.percent(feePct / 100)), description: f.money(shown.fee), numeric: true },
        { id: "total", term: side === "buy" ? t.ticketTotalBuy : t.ticketTotalSell, description: <strong>{f.money(shown.total)}</strong>, numeric: true },
        { id: "yield", term: t.ticketYieldAt(eventWords, f.day(ticket.eventDay)), description: f.percent(ticket.yieldEvent), numeric: true },
        ...(ticket.ytmOffer !== null ? [{ id: "ytm", term: t.ticketYtm(f.day(derived.maturityDay)), description: f.percent(ticket.ytmMaturity), numeric: true }] : []),
        {
          id: "after-fee",
          term: side === "buy" ? t.ticketAfterFeeBuy : t.ticketAfterFeeSell(eventWords),
          description: f.percent(ticket.yieldEventAfterFee),
          numeric: true,
        },
      ]
    : [];

  const depthItems: DescriptionItem[] = depth
    ? [
        { id: "filled", term: t.depthFilled, description: t.depthFilledValue(f.integer(depth.filled), f.integer(depth.requested)) },
        { id: "best", term: side === "buy" ? t.depthBestBuy : t.depthBestSell, description: depth.bestPct === null ? t.depthNoSide : f.percent(depth.bestPct / 100, PRICE_DECIMALS), numeric: depth.bestPct !== null },
        { id: "average", term: t.depthAverage, description: depth.averagePct === null ? t.depthNothing : f.percent(depth.averagePct / 100, PRICE_DECIMALS), numeric: depth.averagePct !== null },
        { id: "slippage", term: t.depthSlippage, description: depth.slippageBp === null ? t.depthNothing : t.depthBp(f.decimal(depth.slippageBp, 1)), numeric: depth.slippageBp !== null },
        { id: "levels", term: t.depthLevels, description: f.integer(depth.levelsUsed), numeric: true },
        { id: "left", term: t.depthLeft, description: depth.left === 0 ? t.depthAllFilled : t.depthLeftValue(f.integer(depth.left)) },
      ]
    : [];

  return (
    <Panel title={t.ticket} className="ticket">
      {source}
      <p className="muted">{t.ticketNote}</p>
      <div className="ticket__inputs">
        <ChoiceGroup<OrderSide>
          label={t.ticketSide}
          choices={[
            { id: "buy", label: t.ticketBuy },
            { id: "sell", label: t.ticketSell },
          ]}
          value={side}
          onChange={changeSide}
        />
        <div data-testid="ticket-limit">
          <PriceYieldField
            label={t.ticketLimit}
            description={
              <>
                {t.ticketLimitDesc(step)}
                {!typed.current && best(side) !== null && <> {side === "buy" ? t.ticketStartsBuy : t.ticketStartsSell}</>}
              </>
            }
            value={value}
            onChange={(next) => {
              typed.current = true;
              setValue(next);
            }}
            yieldFromPrice={(price) => answer("price", price)}
            priceFromYield={(y) => answer("yield", y)}
            priceLabel={t.ticketPrice}
            yieldLabel={derived.event === "offer" ? t.ticketYieldOffer : t.ticketYieldMaturity}
            priceDecimals={PRICE_DECIMALS}
            yieldDecimals={YIELD_DECIMALS}
            // The book's unit, not the issue's step: React Aria snaps a typed
            // value to the step, and an order's price is never changed
            // silently; the engine says when it is off the step.
            priceStep={10 ** -PRICE_DECIMALS}
            onStatusChange={setFieldStatus}
          />
        </div>
        <div data-testid="ticket-lots">
          <QuantityStepper
            label={t.ticketLots}
            value={lots}
            onChange={setLots}
            min={1}
            max={maxLots(bond.lot)}
            lotSize={bond.lot}
            isInvalid={error !== null && fieldOf(error) === "lots"}
            errorMessage={t.ticketBadLots}
          />
        </div>
      </div>

      {!feeOk ? (
        <p className="ticket__error" role="alert">
          {t.ticketNeedFee}
        </p>
      ) : (
        error !== null &&
        (fieldOf(error) === "fee" || fieldOf(error) === "issue") && (
          <p className="ticket__error" role="alert">
            {fieldOf(error) === "fee" ? t.ticketNeedFee : t.errors[error]}
          </p>
        )
      )}

      <section className="block" aria-labelledby={`ticket-figures-h-${id}`} data-testid="ticket-figures">
        <h3 id={`ticket-figures-h-${id}`} className="block__title">
          {t.ticketFigures}
        </h3>
        {ticket ? <DescriptionList items={figures} layout={layout} /> : <p className="muted">{t.ticketNoFigures}</p>}
      </section>

      <section className="block" aria-labelledby={`ticket-depth-h-${id}`} data-testid="ticket-depth">
        <h3 id={`ticket-depth-h-${id}`} className="block__title">
          {t.depth}
        </h3>
        <p className="muted">{t.depthNote(f.day(0))}</p>
        {!ticket ? (
          <p className="muted">{t.ticketNoFigures}</p>
        ) : check.status === "loading" ? (
          <Skeleton label={t.depthLoading}>
            <SkeletonLines count={3} />
          </Skeleton>
        ) : check.status === "failed" || !depth ? (
          <p role="alert">{t.depthFailed}</p>
        ) : (
          <>
            <DescriptionList items={depthItems} layout={layout} />
            {depth.filled === 0 && depth.bestPct !== null && <p className="muted">{side === "buy" ? t.depthNoneBuy : t.depthNoneSell}</p>}
            {depth.fills.length > 0 && (
              <Table<Depth["fills"][number]>
                wrapHeaders
                caption={t.depthCaption}
                columns={[
                  { id: "price", header: t.colPrice, numeric: true, cell: (r) => f.percent(r.pricePct / 100, PRICE_DECIMALS) },
                  { id: "bonds", header: t.colBonds, numeric: true, cell: (r) => f.integer(r.bonds) },
                ]}
                rows={depth.fills}
                rowKey={(r) => r.pricePct}
                rowHeader="price"
                emptyText=""
              />
            )}
          </>
        )}
      </section>

      <section className="block" aria-labelledby={`ticket-gate-h-${id}`} data-testid="ticket-gate">
        <h3 id={`ticket-gate-h-${id}`} className="block__title">
          {t.gate}
        </h3>
        {gate ? (
          <>
            <p data-access={gate.access}>
              <strong>{t.gateAccess[gate.access]}</strong>
              {": "}
              {gate.reasons.map((r) => reasonText(t.gateReason[r], reasonLevel(gates, r))).join("; ")}.
            </p>
            <p className="muted">
              {t.gateRule(t.lawSecurities(SECURITIES_LAW.number, SECURITIES_LAW.test), t.lawSecurities(SECURITIES_LAW.number, SECURITIES_LAW.qualified))}
            </p>
            {gate.reasons.some(isIndexReason) && <p className="muted">{t.gateRuleIndex(["12", "13"].map((part) => t.lawRestrictions(INDEX_LAW.number, f.day(dayOf(INDEX_LAW.date)), INDEX_LAW.article, part)).join("; "))}</p>}
            <RadioGroup<InvestorStatus>
              label={t.gateStatus}
              description={t.gateStatusDesc}
              options={INVESTOR_STATUSES.map((s) => ({ value: s, label: t.gateStatuses[s] }))}
              value={status}
              onChange={setStatus}
            />
            {verdict && (
              <p className={verdict.allowed ? "ticket__verdict" : "ticket__verdict ticket__verdict--held"} data-verdict={verdict.why} role="status">
                {t.gateVerdict[verdict.why]}
              </p>
            )}
          </>
        ) : (
          <p role="alert">{t.gateMissing}</p>
        )}
      </section>

      <div className="ticket__actions">
        <Button id={reviewId} variant="primary" isDisabled={heldBecause !== null} aria-describedby={heldBecause !== null ? `ticket-held-${id}` : undefined} onPress={() => setConfirming(true)}>
          {t.ticketReview}
        </Button>
        {heldBecause !== null && (
          <p id={`ticket-held-${id}`} className="muted">
            {heldBecause}
          </p>
        )}
      </div>
      {record && (
        <div className="ticket__recorded">
          <p role="status">
            {(record.side === "buy" ? t.ticketRecordedBuy : t.ticketRecordedSell)(f.integer(record.bonds), id, f.percent(record.pricePct / 100, PRICE_DECIMALS), f.money(record.total))}
          </p>
          <Button
            id={deleteId}
            onPress={() => {
              focusWhenReady(reviewId);
              setOrders(deleteOrder(id));
            }}
          >
            {t.ticketDelete}
          </Button>
        </div>
      )}
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={(side === "buy" ? t.ticketConfirmTitleBuy : t.ticketConfirmTitleSell)(id)}
        confirmLabel={t.ticketConfirm}
        onConfirm={() => {
          if (!ticket || !shown) return;
          focusWhenReady(deleteId);
          setOrders(recordOrder({ id, side, lots, bonds: ticket.bonds, pricePct: ticket.cleanPct, total: shown.total }));
        }}
      >
        {ticket && shown && (
          <>
            <p>{(side === "buy" ? t.ticketConfirmBuy : t.ticketConfirmSell)(f.integer(ticket.bonds), f.integer(lots), id, f.percent(ticket.cleanPct / 100, PRICE_DECIMALS))}</p>
            <p>{(side === "buy" ? t.ticketConfirmPay : t.ticketConfirmReceive)(f.money(shown.total), f.money(shown.fee), f.money(shown.accrued))}</p>
            {depth && <p>{depth.left === 0 ? t.ticketConfirmFilled(f.percent((depth.averagePct ?? 0) / 100, PRICE_DECIMALS)) : t.ticketConfirmLeft(f.integer(depth.filled), f.integer(depth.left))}</p>}
            <p>{t.ticketConfirmDemo}</p>
          </>
        )}
      </AlertDialog>
    </Panel>
  );
}
