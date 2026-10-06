// A map of peers: every issue as a point, duration across and the
// synthetic rating down from AAA, with this issue, its analogues and the
// issues in the comparison drawn in their own shapes, so colour is never
// the only cue. An SVG drawn at its real width, a description for
// assistive technology, and a table of the highlighted points behind a
// disclosure anyone can open.
//
// App-local: Stoa has a line chart but no scatter chart. A candidate for
// Stoa ("ScatterChart"): points with a category per point drawn as a
// shape and a tone, a categorical or numeric axis, a legend, and the data
// table, with the same text alternative as LineChart.
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Disclosure, Table, niceTicks } from "@ghostjima/stoa-react";
import { RATINGS, ratingIndex } from "../data/issues";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";

type Role = "self" | "analogue" | "compared" | "other";

/** The order points are drawn in: the others under the highlighted ones. */
const LAYER: Role[] = ["other", "compared", "analogue", "self"];

const HEIGHT = 260;
const MARGIN = { top: 8, right: 12, bottom: 32, left: 44 };

/** The width of an element, kept current as it resizes. */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => node.clientWidth > 0 && setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A point's mark: a diamond, a square, a triangle or a dot. */
function Mark({ role, x, y }: { role: Role; x: number; y: number }): ReactNode {
  switch (role) {
    case "self":
      return <path className="peer-map__mark peer-map__mark--self" d={`M${x} ${y - 7}L${x + 7} ${y}L${x} ${y + 7}L${x - 7} ${y}Z`} />;
    case "analogue":
      return <rect className="peer-map__mark peer-map__mark--analogue" x={x - 4.5} y={y - 4.5} width={9} height={9} />;
    case "compared":
      return <path className="peer-map__mark peer-map__mark--compared" d={`M${x} ${y - 6}L${x + 6} ${y + 5}L${x - 6} ${y + 5}Z`} />;
    case "other":
      return <circle className="peer-map__mark peer-map__mark--other" cx={x} cy={y} r={2.5} />;
  }
}

/** A small, stable offset within a rating's row, so issues of one rating
 * and a similar duration do not hide each other. */
function jitter(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.5;
}

export type PeerMapProps = {
  t: Strings;
  f: Formats;
  items: readonly Item[];
  self: Item;
  analogues: readonly Item[];
  compared: readonly string[];
};

export function PeerMap({ t, f, items, self, analogues, compared }: PeerMapProps) {
  const [ref, width] = useWidth();
  const roleOf = (item: Item): Role =>
    item.bond.id === self.bond.id ? "self" : analogues.some((a) => a.bond.id === item.bond.id) ? "analogue" : compared.includes(item.bond.id) ? "compared" : "other";
  const ticks = niceTicks(0, Math.max(...items.map((i) => i.derived.macaulay)), 6);
  const xMax = ticks.values[ticks.values.length - 1] ?? 1;
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (years: number) => MARGIN.left + (years / xMax) * plotW;
  const row = plotH / RATINGS.length;
  const y = (rating: number, id: string) => MARGIN.top + (rating + 0.5 + jitter(id)) * row;
  const highlighted = items.filter((i) => roleOf(i) !== "other");
  const others = items.length - highlighted.length;
  const roleWord: Record<Role, string> = { self: t.mapSelf, analogue: t.mapAnalogue, compared: t.mapCompared, other: t.mapOther };
  // Every other rating is labelled, from AAA: the rows are narrow.
  const ratingTicks = RATINGS.map((r, i) => ({ r, i })).filter(({ i }) => i % 2 === 0);

  return (
    <figure className="peer-map" aria-labelledby="peer-map-label" aria-describedby="peer-map-desc">
      <figcaption>
        <span id="peer-map-label" className="block__subtitle">
          {t.peerMap}
        </span>
        <span id="peer-map-desc" className="peer-map__desc">
          {t.peerMapDesc(self.bond.id, f.integer(others))}
        </span>
      </figcaption>
      <div ref={ref} className="peer-map__plot">
        <svg width={width} height={HEIGHT} className="peer-map__svg" aria-hidden="true" focusable="false">
          {ticks.values.map((v) => (
            <g key={v}>
              <line className="peer-map__grid" x1={x(v)} x2={x(v)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
              <text className="peer-map__tick" x={x(v)} y={HEIGHT - MARGIN.bottom + 14} textAnchor="middle">
                {f.decimal(v, ticks.decimals)}
              </text>
            </g>
          ))}
          {ratingTicks.map(({ r, i }) => (
            <text key={r} className="peer-map__tick" x={MARGIN.left - 6} y={MARGIN.top + (i + 0.5) * row} textAnchor="end" dominantBaseline="middle">
              {r}
            </text>
          ))}
          <line className="peer-map__axis" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={MARGIN.top + plotH} y2={MARGIN.top + plotH} />
          {LAYER.flatMap((layer) =>
            items
              .filter((i) => roleOf(i) === layer)
              .map((i) => <Mark key={i.bond.id} role={layer} x={x(i.derived.macaulay)} y={y(ratingIndex(i.bond.rating), i.bond.id)} />),
          )}
          <text className="peer-map__axis-label" x={MARGIN.left + plotW} y={HEIGHT - 2} textAnchor="end">
            {t.axisDuration}
          </text>
        </svg>
      </div>
      <ul className="peer-map__legend" aria-hidden="true">
        {(["self", "analogue", "compared", "other"] as const).map((role) => (
          <li key={role} className="peer-map__legend-item">
            <svg width={16} height={16} viewBox="0 0 16 16" focusable="false">
              <Mark role={role} x={8} y={8} />
            </svg>
            {roleWord[role]}
          </li>
        ))}
      </ul>
      <Disclosure summary={t.peerTable} className="peer-map__data">
        <Table<Item>
          wrapHeaders
          caption={t.peerTableCaption}
          columns={[
            {
              id: "issue",
              header: t.colIssue,
              cell: (i) => (
                <span className="event-cell">
                  {i.bond.id}
                  <span className="cell-note">{roleWord[roleOf(i)]}</span>
                </span>
              ),
            },
            { id: "rating", header: t.rating, cell: (i) => i.bond.rating },
            { id: "duration", header: t.colDuration, numeric: true, cell: (i) => f.years(i.derived.macaulay) },
          ]}
          rows={highlighted.sort((a, b) => LAYER.indexOf(roleOf(b)) - LAYER.indexOf(roleOf(a)))}
          rowKey={(i) => i.bond.id}
          rowHeader="issue"
          emptyText=""
        />
      </Disclosure>
    </figure>
  );
}
