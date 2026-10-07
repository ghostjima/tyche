// Adding an issue to the holdings from its card: the bonds to hold, and a
// button that adds the issue or sets its bonds. The holdings live in the
// URL (lib/holdings.ts).
import { useState } from "react";
import { Button, NumberField } from "@ghostjima/stoa-react";
import type { Bond } from "../data/issues";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { BONDS_MAX, HOLDINGS_MAX, validBonds } from "../lib/holdings";

export type HoldControlProps = {
  t: Strings;
  f: Formats;
  bond: Bond;
  /** The bonds of this issue held, or null. */
  held: number | null;
  /** Whether the holdings take no new issue. */
  full: boolean;
  onHold: (id: string, bonds: number) => void;
};

export function HoldControl({ t, f, bond, held, full, onHold }: HoldControlProps) {
  const [bonds, setBonds] = useState<number>(held ?? bond.lot);
  const valid = validBonds(bonds);
  if (held === null && full) return <p className="muted">{t.holdingsFull(f.integer(HOLDINGS_MAX))}</p>;
  return (
    <div className="hold" data-testid="hold">
      <NumberField
        label={t.holdingsBonds}
        value={bonds}
        onChange={setBonds}
        step={bond.lot}
        keepTypedValue
        isInvalid={!valid}
        errorMessage={t.holdingsBondsInvalid(f.integer(BONDS_MAX))}
        aria-describedby={`hold-help-${bond.id}`}
      />
      <p id={`hold-help-${bond.id}`} className="muted">
        {t.holdingsBondsHelp(f.integer(bond.lot))}
      </p>
      <div className="hold__actions">
        <Button isDisabled={!valid} onPress={() => onHold(bond.id, bonds)}>
          {held === null ? t.holdingsAdd : t.holdingsUpdate}
        </Button>
        {held !== null && <p className="muted" role="status">{t.holdingsHeld(f.integer(held))}</p>}
      </div>
    </div>
  );
}
