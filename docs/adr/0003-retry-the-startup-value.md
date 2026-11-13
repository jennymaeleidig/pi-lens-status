# 0003 — Retry a rejected startup value for at most three seconds

**Status**: Accepted — 2026-11-13

## Context

Zentui owns the surface that renders the publisher key, and its capability probe reports a key
active only once that surface is ready to demand it. At session start the editor may not have
performed its first safe render, so the probe can answer inactive even though the key becomes
active moments later. While a key is inactive, Zentui drops positive updates for it rather than
retaining them for a later render.

pi-lens publishes its startup LSP status from its own `session_start`. The bridge must load
before pi-lens for the tee to see that publication, so the first mirrored value routinely
arrives while Zentui is still inactive. Publishing once and giving up would leave the chip empty
until pi-lens's next repaint, which may not happen until a later read or turn end.

## Decision

When a publish is rejected because Zentui reports the key inactive, retain the text and probe
again every 100 ms. Stop after 3 seconds (thirty attempts). A successful probe publishes the
retained value and stops the retry; a later pi-lens publication starts a fresh retry if it is
also rejected. An undefined or malformed publication does not disturb a pending retry.

The delay is short enough that a normally starting Zentui is seen before the first prompt, and
the bound is short enough that a genuinely disabled or absent Zentui does not leave a timer
probing for the life of the session. The tee's pass-through remains the fallback throughout.

## Consequences

- A warm LSP lane can appear at session start instead of waiting for the next pi-lens repaint.
- A disabled or absent Zentui costs at most thirty capability probes after a rejected
  publication, then silence.
- The retained value is the latest valid pi-lens publication, so a removal or a newer status
  replaces what a retry would publish.
- The retry never escapes as an uncaught timer error; a failed probe ends that attempt.

## Alternatives considered

**Publish once and rely on pi-lens's repaint.** It leaves the chip empty precisely when the user
wants it before the first prompt, and the repaint schedule belongs to pi-lens.

**Retry until the key becomes active.** It would poll for the whole session when Zentui is
disabled or the alias is removed, duplicating the capability protocol's own answer.

**Delay the first publish instead of retrying.** A fixed delay is a guess at Zentui's render
timing; a bounded probe follows the actual answer and publishes as soon as it turns active.
