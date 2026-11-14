# 0001 — Tee pi-lens's `pi-lens-lsp` publication rather than derive LSP state ourselves

**Status**: Accepted — 2026-11-13. Amended by
[0004](0004-mirror-the-issues-status-too.md): the tee now consumes `pi-lens-issues` too, and each
key keeps its own channel.

## Context

`pi-lens-status` must display pi-lens's LSP status in Zentui's Minimalist border, beside the IDE
and Vim chips, and show nothing when pi-lens publishes no LSP status.

pi-lens computes that status itself. `updateLspStatus` (`dist/index.js`) selects active and
failed server ids, chooses compact or full wording from its `ui.compactLspStatus` setting, and
calls `ctx.ui.setStatus("pi-lens-lsp", …)` with a success-coloured `LSP ✓`, an error-coloured
`LSP ✗`, a dim inactive form, or `undefined` when `ui.hideLspStatus` is on. The same function
runs from a periodic repaint and from the session-start path, so the text tracks server health
without a bridge polling anything.

pi has no public event for that status. Re-deriving it would mean reading pi-lens's internal LSP
service or process table, duplicating its selection rules and its compact/full setting, and
drifting whenever upstream changes either. The published string is the only stable interface.

## Decision

Install a tee over `ctx.ui.setStatus` on the `ui` object pi hands to every extension in one
bind, forward every call unchanged, and mirror the calls keyed `pi-lens-lsp` onto Zentui's
custom-variable bus under the publisher key `pi-lens-status:lsp`. The tee is a deliberate copy
of the sibling status bridge's tee; extracting a shared package waits for a third consumer.

The mirrored text is pi-lens's, safe SGR sequences included. The bridge does not re-derive
server names or add a prefix, and it passes the text through verbatim with two exceptions: text
past Zentui's 256-unit protocol limit is fitted with an ellipsis and, when it retains SGR, one
closing reset; and a value identical to the one previously published is not emitted again. A
predecessor failure under `pi-lens-lsp` is contained — no throw escapes and nothing is mirrored —
while any other key's failure is forwarded unchanged.

## Consequences

- The chip cannot drift from pi-lens's own wording or colour roles, because it is that wording.
  Compact versus full remains pi-lens's choice.
- The package depends on an internal pi API shape: one `ui` object per bind, with `setStatus` as
  a data property. A pi release that changes this breaks the tee silently, and the mitigation is
  a test over the tee plus a re-install on every publish.
- Load order becomes part of the contract: the tee must be installed before pi-lens's
  `session_start` publishes the startup status. Loaded after, the chip stays empty until the
  next repaint. The README leads with it.
- SGR is carried verbatim rather than stripped, because the success/error/dim roles are the
  signal. Zentui's Original colour mode renders them; its Zentui mode strips them without the
  bridge knowing.
- A pi-lens release that publishes onto Zentui's bus natively retires this package.

## Alternatives considered

**Read pi-lens's LSP service and rebuild the text.** It would need the same active/failed
selection, the same session-language filtering, and the same compact setting, all private. It
would also miss the dim inactive case and repaint on our own schedule rather than pi-lens's.

**Read the extension-status map.** It is reachable only inside a `setFooter` factory, and
`setFooter` replaces the footer this package is trying not to depend on. It is also hidden in
the configuration this feature exists to serve.

**Ask pi-lens for an event.** A `pi.events` publication would be the durable interface, but it
does not exist today and would gate the feature on someone else's release. The tee is one
module, so the swap is cheap when it lands.
