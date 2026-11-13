# 0002 — Mirror only; never write `pi-lens-lsp` or a second fallback

**Status**: Accepted — 2026-11-13

## Context

Zentui's custom-variable protocol asks a publisher to probe before each refresh and to keep its
normal fallback when the bus is inactive. The documented pattern publishes the value on
`zentui:variable` when active and otherwise writes the same value with `ctx.ui.setStatus` under
the publisher's own key, then removes that fallback once Zentui takes over.

This bridge is not the publisher of the LSP status. pi-lens is. It sees pi-lens's value only
because it sits in front of `ctx.ui.setStatus`, and the user may hide the extension-status
footer, show it later, or run Zentui disabled.

## Decision

The tee's pass-through is the only fallback. Every pi-lens call reaches the predecessor
unchanged, so when Zentui is absent, disabled, or inactive, pi-lens's status still reaches the
extension-status channel exactly as it did before this package was installed.

The bridge never calls `ctx.ui.setStatus("pi-lens-lsp", …)` itself, never suppresses pi-lens's
call, and never publishes under `pi-lens-status:lsp` on the extension-status channel. On an
inactive capability verdict it emits a removal on the Zentui bus for its own publisher key
only, and retains the latest raw text for the next refresh.

## Consequences

- Installing the bridge changes nothing on surfaces the user is not using. A hidden footer stays
  empty; a shown footer shows pi-lens's own status once.
- There is no duplicate on the extension-status channel from this package's publisher key.
- If a Zentui Starship Footer later aliases the same key and extension statuses also show
  `pi-lens-lsp`, the value can appear on two surfaces. That is another publisher's key and
  another surface's configuration; the bridge names the duplicate in the README and leaves the
  choice to the user rather than policing it.
- An inactive verdict clears the retained Zentui value instead of freezing a stale chip, and a
  later pi-lens repaint or the bounded startup retry republishes it.

## Alternatives considered

**Write a fallback under `pi-lens-status:lsp` on `ctx.ui.setStatus`.** It would duplicate
pi-lens's own key with a second label, force a footer the user hid to gain content, and give the
bridge ownership of text it does not produce.

**Suppress `pi-lens-lsp` to avoid a future duplicate.** It would break the extension-status
footer for every user who relies on it, including users who never enable Zentui, to solve a
duplicate that only appears under a configuration the user chooses.

**Mirror only while a Zentui alias is configured.** The bridge cannot read Zentui's
configuration, and the capability probe already answers the only question that matters: whether
some owned surface currently demands the key.
