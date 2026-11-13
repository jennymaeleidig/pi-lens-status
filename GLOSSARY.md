# pi-lens-status

A presentation-only bridge between `pi-lens` and Zentui: it mirrors the LSP status text pi-lens
already publishes into Zentui's Minimalist border, next to the IDE and Vim mode chips, and shows
nothing when pi-lens publishes no LSP status.

## Language

**Bridge**: An extension loaded between two others that translates between their published
interfaces without owning either. It imports neither package and upgrades independently of
both. _Avoid_: Shim, adapter, glue, plugin, wrapper

**Chip**: The label as rendered in one Zentui border slot; the user-visible result of the
package. _Avoid_: Badge, tag, indicator, widget

**LSP status text**: The single-line string pi-lens hands to `ctx.ui.setStatus` under the key
`pi-lens-lsp`, with `ui.compactLspStatus` on it reads `LSP ✓`, `LSP ✗` or a dim `LSP ✗`. This
package's only input. It may carry SGR escapes for the success, error and dim roles. _Avoid_:
Message, output, label, status

**Tee**: The data property this package installs over `ctx.ui.setStatus` on the `ui` object pi
hands to every extension in one bind. It forwards every call unchanged and copies the ones keyed
`pi-lens-lsp` to its own consumer. A failure under that key is contained and mirrors nothing;
any other key's failure is forwarded unchanged. _Avoid_: Wrapper, hook, patch, interceptor,
monkey-patch

**Refresh**: One capability probe and, when active, a republish of the retained value. After a
rejected startup publish it repeats every 100 ms for at most 3 seconds, then stops. _Avoid_:
Retry loop, poll, tick

**Mirror**: To republish a teed LSP status text on the Zentui channel under this package's
publisher key. The mirror never reformats the text beyond fitting it to the protocol limit.
_Avoid_: Forward, copy, relay

**Publisher key**: The fixed key `pi-lens-status:lsp` under which every value is published. It
is stable across releases. _Avoid_: Variable name, id, status key

**Alias**: The local name a Zentui configuration gives the publisher key with `variables`, so a
slot can reference it as `$lens`. _Avoid_: Publisher key, variable key, slot name

**Slot**: One of the six configurable Minimalist border positions whose template renders the
chip. This package never chooses one. _Avoid_: Segment, position, corner

**Zentui channel**: Zentui's custom-variable bus: a capability probe on
`zentui:variable-capability` and values on `zentui:variable`. An empty or `undefined` value
removes the chip. This package's only output. _Avoid_: Event bus, Zentui API

**Active**: Zentui's per-key report that it owns an enabled surface currently demanding the
publisher key. It is not a guarantee that the chip is visible at the current width. _Avoid_:
Enabled, visible, owned, available

**Fitted value**: An LSP status text cut at a grapheme boundary to at most 256 UTF-16 code units
and marked with an ellipsis, so the protocol never silently ignores an update. The cut keeps
SGR styling and appends a closing reset when styling is retained. Only a value past the protocol
limit is ever fitted, so the chip differs from pi-lens's own text in that case alone. _Avoid_:
Label, truncated, clipped, shortened

**Tee ownership**: The condition that this package's tee is the own `setStatus` property of the
current `ui` object. Every publish checks it and re-installs the tee when a later tee has
displaced it. _Avoid_: Wrapper, registration, installation, control

**Rebind**: pi building a fresh `ui` object and calling every extension's `session_start` again —
on `/reload`, a new session, or a session switch. The tee and any pending retry do not survive a
rebind and must be re-installed. _Avoid_: Reload, restart, reinitialise

**Load order**: The position of a package in pi's `packages` array. This package must load
before `pi-lens`, so the tee exists when pi-lens publishes its startup LSP status from its own
`session_start`. _Avoid_: Priority, precedence
