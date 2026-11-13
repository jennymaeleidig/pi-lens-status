/**
 * The one pure seam of pi-lens-status: what the chip should show for a teed
 * `pi-lens-lsp` status text, and whether that differs from what was last
 * published.
 */

/** Zentui's custom-variable protocol limit, in UTF-16 code units. */
const MAX_TEXT_CODE_UNITS = 256;

/** One decision: the value to hold, and whether it must be published now. */
export type Mirror = Readonly<{
  text: string | undefined;
  publish: boolean;
}>;

const ELLIPSIS = "…";
const RESET = "\x1b[0m";
/** A safe SGR sequence: the styling pi-lens uses for success, error and dim. */
const SGR_PRESENT = /\x1b\[[0-9;:]*m/;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Split text into atomic units: whole SGR sequences and grapheme clusters. */
function units(text: string): string[] {
  const result: string[] = [];
  let last = 0;
  for (const match of text.matchAll(/\x1b\[[0-9;:]*m/g)) {
    const index = match.index ?? last;
    for (const { segment } of segmenter.segment(text.slice(last, index))) result.push(segment);
    result.push(match[0]);
    last = index + match[0].length;
  }
  for (const { segment } of segmenter.segment(text.slice(last))) result.push(segment);
  return result;
}

/** Cut at a unit boundary, measuring UTF-16 code units against the budget. */
function cut(text: string, budget: number): string {
  let used = 0;
  let head = "";
  // A single unit wider than the budget leaves only the ellipsis.
  for (const unit of units(text)) {
    if (used + unit.length > budget) break;
    head += unit;
    used += unit.length;
  }
  return head;
}

/**
 * Fit LSP status text to the protocol limit. Text at or under the limit is
 * returned unchanged, SGR included. Longer text is cut at an atomic unit
 * boundary and marked with an ellipsis inside the budget; if the retained
 * prefix carries SGR, a closing reset is appended so colour cannot leak into
 * the border.
 */
function fit(text: string): string | undefined {
  if (text === "") return undefined;
  if (text.length <= MAX_TEXT_CODE_UNITS) return text;

  const budget = MAX_TEXT_CODE_UNITS - ELLIPSIS.length;
  const head = cut(text, budget);
  if (!SGR_PRESENT.test(head)) return head + ELLIPSIS;

  const styled = cut(text, budget - RESET.length);
  if (!SGR_PRESENT.test(styled)) return styled + ELLIPSIS;
  return styled + ELLIPSIS + RESET;
}

/**
 * Decide what to publish for a teed LSP status text. The text is pi-lens's even
 * when Zentui is inactive; an inactive verdict and an undefined text both clear.
 * Only a value that differs from the last one is published, and a text of the
 * wrong type leaves the published value alone.
 */
export function mirror(
  previous: string | undefined,
  raw: string | undefined,
  active: boolean,
): Mirror {
  // A text of the wrong type is nothing to do: leave the published value alone.
  if (raw !== undefined && typeof raw !== "string") return { text: previous, publish: false };
  const text = active && raw !== undefined ? fit(raw) : undefined;
  return { text, publish: text !== previous };
}
