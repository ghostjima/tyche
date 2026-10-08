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
//! No. 192-FZ, article 11, fifteenth part), bonds with structured income
//! (192-FZ article 11, twelfth and thirteenth parts) and the securities
//! the Bank of Russia's Directive of 27 November 2025 No. 7250-U lists as
//! intended for qualified investors.
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
//! - A floater's coupon (the key rate or RUONIA plus a fixed spread) and a
//!   linker's indexed face value are read as not making the bond's payments
//!   depend on the circumstances of article 2, paragraph 1, subparagraph
//!   23, second paragraph: such issues are gated as fixed-coupon ones. The
//!   texts read do not settle this reading: that paragraph names interest
//!   rates and inflation among the circumstances, and read the other way,
//!   a synthetic government floater or linker would need a test (192-FZ
//!   article 11, thirteenth part, point 2) and a corporate one would need a
//!   test under the conditions of that part's point 1 or be closed to
//!   non-qualified investors (its twelfth part). The brokers' base standard
//!   that sets the tests (39-FZ article 51.2-1) defines bonds with
//!   structured income by the same paragraph, without a list of indices.
//! - An issue's terms may restrict it to qualified investors
//!   (`qualified_only`): every subordinated issue's do, and some others'.

use super::universe::{Issuer, Sector, Segment, SynthIssue, RATINGS};

/// The lowest synthetic rating at which a corporate issue needs no test:
/// A+, as an index into [`RATINGS`], standing for the Bank of Russia
/// board's level (A+ on the national scale from at least two agencies).
/// Issues rated below it need one.
pub const TEST_BELOW: usize = 4;

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
}

impl Reason {
    pub fn code(self) -> &'static str {
        match self {
            Reason::SubordinatedBank => "subordinated_bank",
            Reason::QualifiedOnly => "qualified_only",
            Reason::Government => "government",
            Reason::RatingAtThreshold => "rating_at_threshold",
            Reason::RatingBelowThreshold => "rating_below_threshold",
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
    let (access, reason) = match issue.segment {
        Segment::Government => (Access::Open, Reason::Government),
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
