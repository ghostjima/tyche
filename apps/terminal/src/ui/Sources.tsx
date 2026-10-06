// The source labels the app's widgets carry: SIM for the synthetic
// universe, with a link to the data page, and the Bank of Russia with the
// snapshot's date and a link to cbr.ru, as its terms ask.
import type { MouseEvent } from "react";
import { SNAPSHOT } from "../data/market";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { SourceNote } from "./SourceNote";

/** Opens the data page in the app, keeping the link a real one. */
export type OpenData = (e: MouseEvent<HTMLAnchorElement>) => void;

export function dataHref(): string {
  const url = new URL(location.href);
  url.searchParams.delete("issue");
  url.searchParams.set("page", "data");
  return `${url.pathname}${url.search}`;
}

export function SimSource({ t, onData }: { t: Strings; onData: OpenData }) {
  return (
    <SourceNote tag="SIM" kind="sim">
      {t.simNote}{" "}
      <a href={dataHref()} onClick={onData}>
        {t.dataPage}
      </a>
    </SourceNote>
  );
}

/** The Bank of Russia's label; `curve` adds the Moscow Exchange's credit. */
export function BorSource({ t, f, curve = false }: { t: Strings; f: Formats; curve?: boolean }) {
  return (
    <SourceNote tag={t.borTag} kind="official">
      {t.borNote(f.day(0))} <a href={SNAPSHOT.site}>cbr.ru</a>
      {curve && (
        <>
          . {t.curveCredit} <a href={SNAPSHOT.curve.calculatedBy.url}>moex.com</a>
        </>
      )}
    </SourceNote>
  );
}
