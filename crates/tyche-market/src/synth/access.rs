//! Who may buy an issue of the synthetic universe: anyone, a
//! non-qualified investor after a passed test, or a qualified investor
//! only. The gate is data the order ticket reads. The rules are the law's,
//! read from its text; what the synthetic universe adds is stated apart
//! from them, below, and no issue here is a real security.
//!
//! # The rules
//!
//! The Federal Law of 22 April 1996 No. 39-FZ "On the securities market",
//! as amended up to the Federal Law of 4 August 2026 No. 283-FZ (the text
//! consultant.ru showed on 8 October 2026):
//!
//! - article 3, paragraph 5: a broker buys securities intended for
//!   qualified investors only for a client who is a qualified investor;
//! - article 3.1, paragraph 1, subparagraph 4: a broker executes a
//!   non-qualified individual's order to buy securities only after a
//!   positive test (article 51.2-1), except for the securities of
//!   paragraph 2;
//! - article 3.1, paragraph 2, subparagraph 2: no test for bonds of
//!   Russian issuers (other than structural bonds, bonds convertible into
//!   other securities, bonds secured by a pledge of monetary claims, with
//!   exceptions, and bonds whose payments depend on the circumstances of
//!   article 2, paragraph 1, subparagraph 23, second paragraph) that are
//!   issued under Russian law and whose bonds, issuer or guarantor have a
//!   credit rating not below the level the Bank of Russia's board of
//!   directors sets;
//! - article 3.1, paragraph 2, subparagraph 5: no test for government
//!   securities of the Russian Federation or of its constituent entities,
//!   other than those whose payments depend on those circumstances;
//! - article 3.1, paragraph 7: without a positive test a broker may still
//!   execute such an order after giving the client a notice of the risks
//!   (within the past year) and receiving the client's statement accepting
//!   them, while the client's deals that need a test add up to no more
//!   than 300,000 roubles in the calendar year. This is the investor's
//!   allowance, not a property of an issue: the gate still says `Test`.
//! - article 2, paragraph 1, subparagraph 23, second paragraph, the
//!   circumstances that exclude a bond from the lists of article 3.1,
//!   paragraph 2: payments that depend on changes in prices of goods and
//!   securities, exchange rates, the level of interest rates, the level
//!   of inflation and other indices.
//!   A coupon on the key rate or RUONIA and a face value indexed to
//!   inflation are such payments: the Bank of Russia counts the key rate,
//!   with RUONIA, among the money market indicators of bonds whose income
//!   depends on those circumstances (cbr.ru, 6 August 2024).
//!
//! Bonds whose payments depend on those circumstances are governed by the
//! Federal Law of 11 June 2021 No. 192-FZ, article 11, as amended up to
//! the Federal Law of 23 November 2024 No. 390-FZ (consultant.ru,
//! 9 October 2026):
//!
//! - twelfth part: a non-qualified individual may not buy securities whose
//!   payments depend on those circumstances, except as the thirteenth part
//!   allows;
//! - thirteenth part: such a purchase is allowed after a positive test, or
//!   within the allowance of 39-FZ article 3.1, paragraph 7, when the
//!   securities are (point 2) government securities of the Russian
//!   Federation, or (point 1) bonds whose only income is a coupon paid at
//!   least once a year or whose term is at most three years (a), whose
//!   income in the part that depends on those circumstances depends on one
//!   of the listed indicators, among them inflation in the Russian
//!   Federation and a money market indicator the Bank of Russia publishes,
//!   averaged over the coupon period or taken at its start (b), and whose
//!   bonds, issuer or guarantor are rated at least at the level the Bank
//!   of Russia's board sets for this point (c).
//!
//! The level for point 1 (c): the decision of the Bank of Russia's board
//! of directors of 19 December 2025, applied from 1 July 2026 (cbr.ru,
//! page updated 26 December 2025): "ruAA-" (Expert RA), "AA-(RU)" (ACRA),
//! "AA-.ru" (NKR) or "AA|ru|" (NRA) on the national scale, assigned by at
//! least two credit rating agencies to the bonds or, when they have none,
//! to their issuer or guarantor.
//!
//! The level for article 3.1, paragraph 2, subparagraph 2: the decision of
//! the Bank of Russia's board of directors of 19 December 2025, applied
//! from 1 July 2026 (cbr.ru, page updated 26 December 2025): "ruA+" (Expert
//! RA), "A+(RU)" (ACRA), "A+.ru" (NKR) or "A+|ru|" (NRA) on the national
//! scale, assigned by at least two credit rating agencies to the bonds,
//! their issuer or the person who secured them.
//!
//! Subordinated bonds of a credit institution are intended for qualified
//! investors: the Federal Law of 2 December 1990 No. 395-1 "On banks and
//! banking", article 25.1, fourteenth part, as amended up to the Federal
//! Law of 4 August 2026 (consultant.ru, 8 October 2026).
//!
//! Not encoded, because no synthetic issue is of these kinds: structural
//! bonds (39-FZ article 27.1-1, paragraph 6), bonds without a maturity
//! (article 27.5-7, paragraph 2), bonds of foreign issuers (article 3.1,
//! paragraph 2, subparagraph 3, and the Federal Law of 11 June 2021
//! No. 192-FZ, article 11, fifteenth part), bonds whose income follows
//! an indicator other than the key rate, RUONIA or inflation (prices of
//! shares, metals or currencies, indices) and the securities the Bank of
//! Russia's Directive of 27 November 2025 No. 7250-U lists as intended
//! for qualified investors.
//!
//! # What the synthetic universe adds
//!
//! - Every issuer is a Russian company or the fictional treasury, every
//!   issue is issued under Russian law and none is structural,
//!   convertible, secured by monetary claims or perpetual.
//! - A synthetic government bond stands for a government security of the
//!   Russian Federation.
//! - Ratings come from a fictional agency on a scale of its own
//!   ([`RATINGS`]), read as the national-scale rating two of the four
//!   agencies above would assign, notch for notch: synthetic A+ is "A+ on
//!   the national scale from at least two agencies". This is the
//!   universe's assumption, not part of the rule.
//! - A floater pays the key rate or RUONIA plus a fixed spread, fixed for
//!   each coupon period at its start, and every corporate floater pays a
//!   coupon at least once a year: so it meets points 1 (a) and (b), and
//!   point 1 (c) decides. The same synthetic rating stands for the level
//!   of point 1 (c), AA-, as for the level of article 3.1.
//! - A linker's face value is indexed to inflation: the indexation is a
//!   payment besides the coupon, so a corporate linker does not meet
//!   point 1 (a) and is closed to non-qualified investors (the twelfth
//!   part); a synthetic government linker is a government security
//!   (point 2).
//! - An issue's terms may restrict it to qualified investors
//!   (`qualified_only`): every subordinated issue's do, and some others'.

use super::universe::{CouponKind, Issuer, Sector, Segment, SynthIssue, RATINGS};

/// The lowest synthetic rating at which a corporate issue needs no test:
/// A+, as an index into [`RATINGS`], standing for the Bank of Russia
/// board's level (A+ on the national scale from at least two agencies).
/// Issues rated below it need one.
pub const TEST_BELOW: usize = 4;

/// The lowest synthetic rating at which a corporate floater is open to a
/// non-qualified investor after a test: AA-, as an index into [`RATINGS`],
/// standing for the Bank of Russia board's level for 192-FZ article 11,
/// thirteenth part, point 1 (c) (AA- on the national scale from at least
/// two agencies). A corporate floater rated below it is for qualified
/// investors only.
pub const INDEX_BELOW: usize = 3;

/// The most a non-qualified investor's deals that need a test may add up
/// to in a calendar year without a positive test, after the broker's
/// notice of the risks and the investor's statement accepting them,
/// roubles (39-FZ article 3.1, paragraph 7).
pub const WITHOUT_TEST_PER_YEAR: f64 = 300_000.0;

/// Who may buy an issue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    /// Anyone.
    Open,
    /// A qualified investor, or a non-qualified one who has passed the
    /// test for this kind of bond (or stays within
    /// [`WITHOUT_TEST_PER_YEAR`] after the broker's notice of the risks).
    Test,
    /// A qualified investor only.
    Qualified,
}

impl Access {
    pub fn code(self) -> &'static str {
        match self {
            Access::Open => "open",
            Access::Test => "test",
            Access::Qualified => "qualified",
        }
    }
}

/// Why an issue has the access it has.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    /// A subordinated bond of a credit institution (the banking law).
    SubordinatedBank,
    /// The issue's terms restrict it to qualified investors.
    QualifiedOnly,
    /// A synthetic government bond (39-FZ article 3.1, paragraph 2,
    /// subparagraph 5).
    Government,
    /// A corporate issue rated at or above [`TEST_BELOW`] (article 3.1,
    /// paragraph 2, subparagraph 2).
    RatingAtThreshold,
    /// A corporate issue rated below [`TEST_BELOW`] (article 3.1,
    /// paragraph 1, subparagraph 4).
    RatingBelowThreshold,
    /// A synthetic government floater or linker: its payments follow an
    /// index, so it is not in article 3.1, paragraph 2, subparagraph 5,
    /// and 192-FZ article 11, thirteenth part, point 2 allows it after a
    /// test.
    IndexGovernment,
    /// A corporate floater rated at or above [`INDEX_BELOW`]: 192-FZ
    /// article 11, thirteenth part, point 1 allows it after a test.
    IndexCorporate,
    /// A corporate floater rated below [`INDEX_BELOW`]: 192-FZ article 11,
    /// twelfth part.
    IndexBelowLevel,
    /// A corporate linker: its indexed face value is income besides the
    /// coupon, so it is not in 192-FZ article 11, thirteenth part, point 1,
    /// and the twelfth part closes it.
    IndexedNominal,
}

impl Reason {
    pub fn code(self) -> &'static str {
        match self {
            Reason::SubordinatedBank => "subordinated_bank",
            Reason::QualifiedOnly => "qualified_only",
            Reason::Government => "government",
            Reason::RatingAtThreshold => "rating_at_threshold",
            Reason::RatingBelowThreshold => "rating_below_threshold",
            Reason::IndexGovernment => "index_government",
            Reason::IndexCorporate => "index_corporate",
            Reason::IndexBelowLevel => "index_below_level",
            Reason::IndexedNominal => "indexed_nominal",
        }
    }
}

/// An issue's access and the reasons for it, in the order of the rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Gate {
    pub access: Access,
    pub reasons: Vec<Reason>,
}

/// The gate of an issue of `issuer`, by the rules above.
pub fn gate(issue: &SynthIssue, issuer: &Issuer) -> Gate {
    let mut reasons = Vec::new();
    if issue.subordinated && issuer.sector == Sector::Banking {
        reasons.push(Reason::SubordinatedBank);
    }
    if issue.qualified_only {
        reasons.push(Reason::QualifiedOnly);
    }
    if !reasons.is_empty() {
        return Gate {
            access: Access::Qualified,
            reasons,
        };
    }
    let indexed = issue.kind != CouponKind::Fixed;
    let (access, reason) = match issue.segment {
        Segment::Government if indexed => (Access::Test, Reason::IndexGovernment),
        Segment::Government => (Access::Open, Reason::Government),
        Segment::Corporate if issue.kind == CouponKind::Linker => {
            (Access::Qualified, Reason::IndexedNominal)
        }
        Segment::Corporate if indexed && issue.rating > INDEX_BELOW => {
            (Access::Qualified, Reason::IndexBelowLevel)
        }
        Segment::Corporate if indexed => (Access::Test, Reason::IndexCorporate),
        Segment::Corporate if issue.rating > TEST_BELOW => {
            (Access::Test, Reason::RatingBelowThreshold)
        }
        Segment::Corporate => (Access::Open, Reason::RatingAtThreshold),
    };
    Gate {
        access,
        reasons: vec![reason],
    }
}

/// The threshold's name on the synthetic scale.
pub fn threshold_rating() -> &'static str {
    RATINGS[TEST_BELOW]
}
