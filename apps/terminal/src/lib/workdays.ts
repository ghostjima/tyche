// Working days as the synthetic universe counts them: Monday to Friday,
// with no holiday calendar (tyche-market's events rule).
import { dayToMs } from "../data/market";

/** Whether a day offset from the valuation date falls on Monday to Friday. */
export function isWorkingDay(day: number): boolean {
  const weekday = new Date(dayToMs(day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** Working days from today (day 0) to a deadline day: the working days
 * after today up to and including the deadline; 0 when the deadline is
 * today; negative, the working days since, once it has passed. */
export function workingDaysUntil(deadline: number): number {
  if (deadline === 0) return 0;
  const step = deadline > 0 ? 1 : -1;
  let n = 0;
  for (let d = step; step > 0 ? d <= deadline : d >= deadline; d += step) {
    if (isWorkingDay(d)) n += 1;
  }
  return step * n;
}
