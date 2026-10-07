//! Who may buy an issue of the synthetic universe: anyone, a
//! non-qualified investor after a passed test, or a qualified investor
//! only. The gate is data the order ticket reads; the rule is the
//! synthetic universe's, modelled on the Russian rules below, and is not a
//! statement about any real security.
//!
//! The rules it is modelled on, in the Federal Law of 22 April 1996
//! No. 39-FZ "On the securities market", as amended up to the Federal Law
//! of 4 August 2026 No. 283-FZ (the revision consultant.ru showed on
//! 7 October 2026):
//!
//! - article 51.2 (qualified investors), with article 27.6: securities
//!   intended for qualified investors are acquired only by qualified
//!   investors, through a broker;
//! - article 3.1, with article 51.2-1 (testing of individuals): a broker
//!   carries out a non-qualified individual's purchase of securities only
//!   after a positive test, except for the securities article 3.1(2)
//!   lists, among them bonds of Russian issuers (not structured and not
//!   convertible) that meet its credit rating conditions.
//!
//! The synthetic universe follows them as:
//!
//! 1. An issue whose terms restrict it to qualified investors
//!    (`qualified_only`, which every subordinated issue has) is for
//!    qualified investors only.
//! 2. A synthetic government bond is open to everyone.
//! 3. A corporate issue rated below [`TEST_BELOW`] on the synthetic scale
//!    needs a passed test from a non-qualified investor. The threshold is
//!    an assumption of the synthetic universe, standing in for the level
//!    the Bank of Russia's board sets for real ratings; no issue here has
//!    a real rating.
//! 4. Every other issue is open to everyone.

use super::universe::{Segment, SynthIssue, RATINGS};

/// The lowest synthetic rating at which a corporate issue needs no test:
/// BBB-, as an index into [`RATINGS`]. Issues rated below it need one.
pub const TEST_BELOW: usize = 9;

/// Who may buy an issue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    /// Anyone.
    Open,
    /// A qualified investor, or a non-qualified one who has passed the
    /// test for this kind of bond.
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
    /// The issue's terms restrict it to qualified investors.
    QualifiedOnly,
    /// A subordinated issue (also restricted to qualified investors).
    Subordinated,
    /// A corporate issue rated below [`TEST_BELOW`].
    RatingBelowThreshold,
    /// A synthetic government bond.
    Government,
    /// A corporate issue rated at or above [`TEST_BELOW`].
    RatingAtThreshold,
}

impl Reason {
    pub fn code(self) -> &'static str {
        match self {
            Reason::QualifiedOnly => "qualified_only",
            Reason::Subordinated => "subordinated",
            Reason::RatingBelowThreshold => "rating_below_threshold",
            Reason::Government => "government",
            Reason::RatingAtThreshold => "rating_at_threshold",
        }
    }
}

/// An issue's access and the reasons for it, in the order of the rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Gate {
    pub access: Access,
    pub reasons: Vec<Reason>,
}

/// The gate of an issue, by the rule above.
pub fn gate(issue: &SynthIssue) -> Gate {
    if issue.qualified_only {
        let mut reasons = vec![Reason::QualifiedOnly];
        if issue.subordinated {
            reasons.push(Reason::Subordinated);
        }
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
