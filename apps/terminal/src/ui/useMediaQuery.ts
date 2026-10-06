import { useEffect, useState } from "react";

/** Whether a media query matches now, kept current as it changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const follow = () => setMatches(list.matches);
    follow();
    list.addEventListener("change", follow);
    return () => list.removeEventListener("change", follow);
  }, [query]);
  return matches;
}

/** The width from which the list and the issue sit side by side; the
 * stylesheet uses the same breakpoint. */
export const WIDE = "(min-width: 64rem)";

/** A phone: the payments table drops its total column. */
export const NARROW = "(max-width: 40rem)";
