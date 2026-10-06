// "Data and licensing": every source the terminal uses, its terms, and
// what is synthetic. A page of its own within the app (?page=data), with
// its heading as the focus target when it opens.
import { forwardRef } from "react";
import { Button, DescriptionList, Panel } from "@ghostjima/stoa-react";
import { SNAPSHOT, TAX_RULES_DAY, dayOf } from "../data/market";
import type { Strings } from "../i18n";
import type { Formats } from "../lib/format";
import { SourceNote } from "./SourceNote";

/** The articles of the Tax Code the engine's tax rules follow. */
const TAX_ARTICLES = "214.1, 219.1, 224";
const CODE_LICENCE = "MIT OR Apache-2.0";
const FONT_LICENCE = "SIL Open Font License 1.1";
/** The day the market's aggregate figures were taken. */
const CALIBRATION_DATE = "2026-10-06";

export type DataPageProps = {
  t: Strings;
  f: Formats;
  /** Issues and issuers in the universe, when it has loaded. */
  counts: { issues: number; issuers: number } | null;
  onBack: () => void;
};

export const DataPage = forwardRef<HTMLHeadingElement, DataPageProps>(function DataPage({ t, f, counts, onBack }, heading) {
  const link = (href: string, text: string) => <a href={href}>{text}</a>;
  return (
    <section className="data-page" aria-labelledby="data-page-h">
      <h2 id="data-page-h" className="data-page__title" tabIndex={-1} ref={heading}>
        {t.dataPage}
      </h2>
      <p className="data-page__intro">{t.dataIntro}</p>

      <Panel title={t.dataSimTitle} level={3}>
        <SourceNote tag="SIM" kind="sim">
          {counts ? t.dataSimBody(f.integer(counts.issues), f.integer(counts.issuers)) : t.simNote}
        </SourceNote>
        <DescriptionList
          items={[
            { term: t.dataSimIssuers, description: t.dataSimIssuersText },
            { term: t.dataSimRatings, description: t.dataSimRatingsText },
            { term: t.dataSimPrices, description: t.dataSimPricesText },
            { term: t.dataSimMarket, description: t.dataSimMarketText(f.day(dayOf(CALIBRATION_DATE))) },
            { term: t.dataSimLicence, description: t.dataSimLicenceText(CODE_LICENCE) },
          ]}
        />
      </Panel>

      <Panel title={t.dataBorTitle} level={3}>
        <SourceNote tag={t.borTag} kind="official">
          {t.dataBorBody(f.day(0), f.day(dayOf(SNAPSHOT.retrievedAt.slice(0, 10))))} {link(SNAPSHOT.site, "cbr.ru")}
        </SourceNote>
        <DescriptionList
          items={[
            { term: t.dataBorKeyRate, description: <>{t.dataBorKeyRateText} {link(SNAPSHOT.keyRate.page, "cbr.ru")}</> },
            {
              term: t.dataBorCurve,
              description: (
                <>
                  {t.dataBorCurveText} {link(SNAPSHOT.curve.page, "cbr.ru")}, {link(SNAPSHOT.curve.calculatedBy.url, "moex.com")}
                </>
              ),
            },
            { term: t.dataBorInflation, description: <>{t.dataBorInflationText} {link(SNAPSHOT.inflation.page, "cbr.ru")}</> },
            { term: t.dataBorTerms, description: <>{t.dataBorTermsText} {link(SNAPSHOT.terms, "cbr.ru/user_agreement")}</> },
          ]}
        />
      </Panel>

      <Panel title={t.dataMoexTitle} level={3}>
        <p className="data-page__text">{t.dataMoexText}</p>
      </Panel>

      <Panel title={t.dataNotUsedTitle} level={3}>
        <p className="data-page__text">{t.dataNotUsedText}</p>
      </Panel>

      <Panel title={t.dataTaxTitle} level={3}>
        <p className="data-page__text">{t.dataTaxText(TAX_ARTICLES, f.day(TAX_RULES_DAY))}</p>
      </Panel>

      <Panel title={t.dataFontsTitle} level={3}>
        <p className="data-page__text">{t.dataFontsText(CODE_LICENCE, FONT_LICENCE)}</p>
      </Panel>

      <div>
        <Button variant="ghost" onPress={onBack}>
          {t.dataBack}
        </Button>
      </div>
    </section>
  );
});
