// An issuer's name in the interface's language.
import type { Bond } from "../data/issues";
import type { Strings } from "../i18n";

export function issuerName(bond: Bond, t: Strings): string {
  return bond.issuer.kind === "government" ? t.govIssuer : t.companies[bond.issuer.sector](t.places[bond.issuer.place]);
}

/** What a search looks in besides the ticker: the issuer's name and, for
 * a synthetic government bond, its ticker written with the interface's
 * code for the series ("СГ-104" in Russian). */
export function searchTexts(bond: Bond, t: Strings): string[] {
  const name = issuerName(bond, t);
  return bond.issuer.kind === "government" ? [name, bond.id.replace(/^SG/, t.govCode)] : [name];
}
