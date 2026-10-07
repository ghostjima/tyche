// The analogues of an issue, issues of a similar rating and duration,
// with their yields and G-spreads, each one a step away: open it, or add
// it to the comparison; and the map of peers they sit on.
import { Button, Table, keepFocusInPlace } from "@ghostjima/stoa-react";
import type { Engine } from "../engine/types";
import type { Strings } from "../i18n";
import type { Item } from "../lib/filters";
import type { Formats } from "../lib/format";
import { analogues as findAnalogues, gSpread } from "../lib/peers";
import { PeerMap } from "./PeerMap";

export type AnaloguesProps = {
  t: Strings;
  f: Formats;
  engine: Engine;
  item: Item;
  items: readonly Item[];
  compared: readonly string[];
  onOpen: (id: string) => void;
};

/** A G-spread in basis points, or why there is none. */
export function gSpreadText(t: Strings, f: Formats, engine: Engine, item: Item): string {
  const g = gSpread(engine, item);
  if (g === null) return t.gSpreadNone;
  return "error" in g ? t.errors[g.error] : t.gSpreadValue(f.signed(g.ok.spreadBp, 0));
}

export function Analogues({ t, f, engine, item, items, compared, onOpen }: AnaloguesProps) {
  const found = findAnalogues(item, items);
  return (
    <section className="block" aria-labelledby="analogues-h" data-testid="analogues">
      <h3 id="analogues-h" className="block__title">
        {t.analogues}
      </h3>
      <p className="muted">{t.analoguesNote}</p>
      {found.length === 0 ? (
        <p className="muted">{t.analoguesNone}</p>
      ) : (
        <Table<Item>
          wrapHeaders
          caption={t.analoguesCaption(item.bond.id)}
          columns={[
            {
              id: "issue",
              header: t.colIssue,
              // The rating and the duration under the ticker, so the table
              // fits a phone.
              cell: (i) => (
                <span className="event-cell">
                  <Button
                    variant="ghost"
                    size="small"
                    aria-label={t.openIssue(i.bond.id)}
                    onPress={(e) => {
                      // The card is drawn anew for the other issue: the focus
                      // goes to its first stop, not to the page.
                      keepFocusInPlace(e.target);
                      onOpen(i.bond.id);
                    }}
                  >
                    {i.bond.id}
                  </Button>
                  <span className="cell-note">{t.analogueNote(i.bond.rating, f.years(i.derived.macaulay))}</span>
                </span>
              ),
            },
            { id: "yield", header: t.colYield, numeric: true, cell: (i) => f.percent(i.derived.yieldEvent) },
            { id: "g", header: t.colGSpread, numeric: true, cell: (i) => gSpreadText(t, f, engine, i) },
          ]}
          rows={found}
          rowKey={(i) => i.bond.id}
          rowHeader="issue"
          emptyText=""
        />
      )}
      <PeerMap t={t} f={f} items={items} self={item} analogues={found} compared={compared} />
    </section>
  );
}
