# Changelog

## [Unreleased]

- Mirror pi-lens's `pi-lens-issues` diagnostics summary into a second Zentui border slot under
  the publisher key `pi-lens-status:issues`, through the same tee. Each status key keeps its own
  retained value, dedupe, probe, bounded retry, and shutdown removal, so either chip can appear,
  clear, or fail without disturbing the other.
- Mirror pi-lens's `pi-lens-lsp` status text into a Zentui border slot under the publisher key
  `pi-lens-status:lsp` by teeing `ctx.ui.setStatus`. Safe SGR sequences are preserved, over-limit
  text is fitted at a grapheme boundary with a closing reset, and consecutive duplicates are
  dropped.
- Probe Zentui's capability on every refresh; an inactive verdict clears the retained value.
- Retain the startup value and retry the probe every 100 ms for at most 3 seconds after Zentui
  rejects it, because its startup probe can precede the first safe decoration.
- Emit a removal on `session_shutdown` and rebind cleanly on the next `session_start`.
