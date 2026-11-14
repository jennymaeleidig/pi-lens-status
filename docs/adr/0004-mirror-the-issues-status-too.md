# 0004 — Mirror `pi-lens-issues` through the same tee, with an independent channel

**Status**: Accepted — 2026-11-14

## Context

pi-lens now also publishes a compact diagnostics summary through `ctx.ui.setStatus`, under the key
`pi-lens-issues`. It is opt-in (`ui.issuesStatus`), and when on it reads `●NE`, `!NW`,
`⚠ N unchecked`, `✓ clean`, or carries a neutral `suppressed: N` suffix. The text is plain, with
no SGR.

The reason this package exists has not changed: pi-lens exposes no status event, and the published
string is the stable interface. The new key is the same kind of input as `pi-lens-lsp`, so it can
use the same tee already installed on the bind's `ui` object.

The bridge could fold the diagnostics counts into the existing LSP chip, install a second tee for
the new key, or consume both keys through one tee. Folding would make one chip own two unrelated
meanings and would have to choose a precedence when either status is absent. A second tee would
duplicate the ownership, stacking and restore logic for no gain. One tee can forward every call
and dispatch by key.

## Decision

The existing tee consumes both `pi-lens-lsp` and `pi-lens-issues`. Each key has its own channel
with independent retained value, dedupe, capability probe, bounded retry, and publisher key:

- `pi-lens-lsp` → `pi-lens-status:lsp` (alias `$lens`)
- `pi-lens-issues` → `pi-lens-status:issues` (alias `$issues`)

The bridge does not aggregate the two texts, reorder them, or add a label. It mirrors each one
verbatim, fitting only text past Zentui's 256-unit limit. A removal, a wrong-typed value, an
inactive capability verdict, a rebind and a shutdown affect each channel on its own; a failed host
write under either mirrored key is contained without suppressing the other key, and a failure
under any other key is still forwarded.

The channels share the tee and the host `ui`, not their state. The second tee installs no
configuration and reads no Zentui file: the alias is the user's, and the capability probe answers
whether that alias currently demands the publisher key.

## Consequences

- A user can show either chip, both, or neither. Omitting the `issues` alias leaves the LSP chip
  untouched, and vice versa.
- The two chips cannot drift from pi-lens's wording or colour roles, because they are that
  wording. The issues chip stays plain because pi-lens publishes it plain.
- Enabling both lengthens the border line; width truncation is Zentui's choice, not the bridge's.
  The README states the trade-off but does not choose a slot order for the user.
- A pi-lens release without `pi-lens-issues` leaves the issues channel silent. The bridge stays
  loaded and upgrades independently of that release.
- The tee's ownership and restore logic stays single-instance. A later tee stacked above this one
  still reaches both channels, and a failed write under one key does not change the other.

## Alternatives considered

**Aggregate the issues counts into `pi-lens-status:lsp`.** One chip would mix LSP health with
diagnostics totals, and it would have to invent precedence when one side is absent or hidden. It
would also make the LSP chip differ from pi-lens's own text even when the user only asked for LSP
status.

**Install a second tee for `pi-lens-issues`.** It would double the install/restore/ownership
surface and create an ordering question between two tees this package owns. A single tee already
sees every call and can dispatch by key.

**Publish one combined publisher key with two slots.** Zentui keys are independent strings, and a
combined value would force both chips to appear or disappear together. Two publisher keys keep
each slot independently removable.

**Re-derive the counts from `pi-lens` internals.** The published summary is already the product of
one store projection upstream, so re-deriving it would duplicate that logic and drift from it.
