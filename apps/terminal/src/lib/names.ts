// An issuer's name in the interface's language.
import type { Bond } from "../data/issues";
import type { Strings } from "../i18n";

export function issuerName(bond: Bond, t: Strings): string {
  return bond.issuer.kind === "ofz" ? t.ofzIssuer : t.companies[bond.issuer.industry](t.places[bond.issuer.place]);
}

/** What a search looks in besides the ticker: the issuer's name and, for
 * a federal loan bond, its ticker written with the interface's name for
 * OFZ ("ОФЗ-26217" in Russian). */
export function searchTexts(bond: Bond, t: Strings): string[] {
  const name = issuerName(bond, t);
  return bond.issuer.kind === "ofz" ? [name, bond.id.replace(/^OFZ/, t.tagOfz)] : [name];
}
