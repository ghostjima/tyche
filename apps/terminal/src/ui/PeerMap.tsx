// A map of peers: every issue as a point, duration across and the
// synthetic rating down from AAA, with this issue, its analogues and the
// issues in the comparison drawn in their own shapes and tones, so colour
// is never the only cue. Stoa's ScatterChart draws it: named and described
// for assistive technology, one tab stop whose arrow keys walk the points,
// and a table of the highlighted points behind a disclosure anyone can
// open.
import { ScatterChart, type ScatterCategory, type ScatterPoint } from "@ghostjima/stoa-react";
import { RATINGS } from "../data/issues";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";

type Role = "self" | "analogue" | "compared" | "other";

/** The categories the table lists: every point but the other issues. */
const HIGHLIGHTED: Role[] = ["self", "analogue", "compared"];

export type PeerMapProps = {
  t: Strings;
  f: Formats;
  items: readonly Item[];
  self: Pick<Item, "bond" | "derived">;
  analogues: readonly Item[];
  compared: readonly string[];
};

export function PeerMap({ t, f, items, self, analogues, compared }: PeerMapProps) {
  const roleOf = (item: Item): Role =>
    item.bond.id === self.bond.id ? "self" : analogues.some((a) => a.bond.id === item.bond.id) ? "analogue" : compared.includes(item.bond.id) ? "compared" : "other";
  // In order of importance: this issue is drawn on top and listed first
  // in the legend and the table. The shapes are the ones the description
  // names: a diamond, squares, triangles and dots.
  const categories: ScatterCategory[] = [
    { id: "self", name: t.mapSelf, shape: "diamond", tone: "accent" },
    { id: "analogue", name: t.mapAnalogue, shape: "square", tone: "accent" },
    { id: "compared", name: t.mapCompared, shape: "triangle", tone: "warning" },
    { id: "other", name: t.mapOther, shape: "circle", tone: "neutral", size: "small" },
  ];
  const points: ScatterPoint[] = items.map((i) => ({
    id: i.bond.id,
    x: i.derived.macaulay,
    y: i.bond.rating,
    category: roleOf(i),
    label: `${i.bond.id} · ${i.bond.rating} · ${f.years(i.derived.macaulay)}`,
  }));
  const others = points.filter((p) => p.category === "other").length;
  const description = t.peerMapDesc(self.bond.id, f.integer(others));

  // The title and the description are drawn for everyone; the chart names
  // and describes itself for assistive technology, so the drawn copies are
  // not read twice.
  return (
    <div className="peer-map">
      <div className="peer-map__head" aria-hidden="true">
        <p className="block__subtitle">{t.peerMap}</p>
        <p className="peer-map__desc">{description}</p>
      </div>
      <ScatterChart
        label={t.peerMap}
        description={description}
        categories={categories}
        points={points}
        xLabel={t.axisDuration}
        // Short, so its column fits a phone; the description says the
        // rating is synthetic.
        yLabel={t.axisRating}
        yCategories={RATINGS}
        // The axis name carries the unit, so the table's column stays narrow.
        formatX={(x) => f.decimal(x, 2)}
        dataTable="toggle"
        tableCategories={HIGHLIGHTED}
        tableCaption={t.peerTableCaption}
        labelHeader={t.colIssue}
      />
    </div>
  );
}
