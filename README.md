# pi-lens-status

Show pi-lens's LSP and diagnostics status in Zentui Minimalist border slots, beside your IDE and
Vim mode chips — and nothing at all for a status pi-lens does not publish.

> Status: implemented for both pi-lens status keys. The design is settled and written down in
> [`GLOSSARY.md`](GLOSSARY.md) and the architectural bets in
> [`docs/adr/0001-tee-pi-lens-lsp-publication.md`](docs/adr/0001-tee-pi-lens-lsp-publication.md),
> [`docs/adr/0002-mirror-only-no-fallback-write.md`](docs/adr/0002-mirror-only-no-fallback-write.md),
> [`docs/adr/0003-retry-the-startup-value.md`](docs/adr/0003-retry-the-startup-value.md), and
> [`docs/adr/0004-mirror-the-issues-status-too.md`](docs/adr/0004-mirror-the-issues-status-too.md).

## Install

Load order is part of the contract:

```text
pi-lens-status  ->  pi-lens  ->  pi-zentui
```

```sh
pi install git:github.com/jennymaeleidig/pi-lens-status
pi install npm:pi-lens
pi install npm:pi-zentui
```

This package must load **before** `pi-lens`. The tee has to exist when `pi-lens` publishes its
startup statuses from its own `session_start`; loaded after it, the tee misses those first texts
and the chips stay empty until the next repaint. Zentui or another bridge may install its own
controller over the tee later in the same start, so every publish re-installs the tee above it.

`pi install` appends to `packages`. If `pi-lens-status`, `pi-lens` or `pi-zentui` is already
installed, put the `pi-lens-status` source first in the array and restart. Update the git source
with `pi update git:github.com/jennymaeleidig/pi-lens-status`.

## Configuration

Two things make the chips visible. This package writes neither of them and reads neither file.

1. **pi-lens publishes the statuses you want.** In `~/.pi-lens/config.json` (the global pi-lens
   configuration), set:

   ```json
   { "ui": { "compactLspStatus": true, "issuesStatus": true } }
   ```

   The LSP chip is pi-lens's own text: `LSP ✓` in the success role, `LSP ✗` in the error role, and
   a dim `LSP ✗` when nothing is warm. With compact off, pi-lens publishes the full server list,
   which is longer and fitted to the protocol limit. `ui.hideLspStatus: true` suppresses
   `pi-lens-lsp` entirely, so that chip stays gone; this package follows that setting by doing
   nothing else.

   The issues chip is opt-in through `ui.issuesStatus`. With it on, the chip is pi-lens's own
   diagnostics summary: `●2E !3W` for blocking and other findings, `⚠ N unchecked` while a file
   has not been checked, `✓ clean` only after a checked file has no findings, and a neutral
   `suppressed: N` suffix when applicable. It carries no SGR and is passed through verbatim. On a
   pi-lens release that does not publish `pi-lens-issues`, this chip is simply absent.

2. **Zentui names each publisher key and references it in a slot.** In the `minimalist` style,
   under `variables` and `formats`:

   ```json
   {
     "components": {
       "editor": {
         "style": "minimalist",
         "styles": {
           "minimalist": {
             "variables": {
               "ide": "pi-ide-status:ide",
               "vim": "pi-vim-status:vim",
               "lens": "pi-lens-status:lsp",
               "issues": "pi-lens-status:issues"
             },
             "formats": {
               "bottomRight": "$ide$join_sep$lens$join_sep$issues$join_sep$vim"
             }
           }
         }
       }
     }
   }
   ```

   An alias value is the full publisher key, not a short name. `$join_sep` is conditional: an
   absent chip leaves no dangling separator, so `$ide · $vim` still reads correctly. Without both
   an alias and a slot that references it, Zentui reports that key as not active and the chip can
   only reach the `$extensions` aggregate. Omit the `issues` alias or its slot reference to keep
   only the LSP chip.

Zentui's **Custom value colors** setting works as usual. Original (the default) renders the safe
SGR sequences pi-lens publishes, so the LSP chip's success, error and dim roles keep their
meaning. Zentui strips the styling and still shows the text. The issues chip is plain text in
either mode.

## Duplicate surface, accepted

If you later enable Zentui's Starship Footer, alias `pi-lens-status:lsp` or
`pi-lens-status:issues` there too, **and** make `pi-lens-lsp` or `pi-lens-issues` visible in
extension statuses, the same value can appear twice. This package does not remove or rewrite
pi-lens's own publications, so it will not police another publisher's key. Leave one of the
surfaces off for each value.

The extension-status footer is a separate surface. This package never writes `pi-lens-lsp` or
`pi-lens-issues` and never publishes under its own keys there, so enabling that footer later
still shows exactly what pi-lens wrote, once.

## Test by hand

With the configuration above and the checkout loaded first (see Development):

1. Open a TypeScript project with a known error so pi-lens warms a server. The LSP chip reads
   `LSP ✓` beside `$ide · $vim` before your first prompt. `/lens-health` agrees with it.
2. Break the language-server configuration and start a new session. The LSP chip reads `LSP ✗` in
   the error role.
3. Start a new session with no warm servers. The LSP chip reads a dim `LSP ✗`.
4. With `ui.issuesStatus: true`, open a project with a known error and let pi-lens analyze a
   file. The issues chip reads the current totals such as `●1E`; while a file is pending it
   reads `⚠ N unchecked`, and after a checked file with no findings it reads `✓ clean`.
5. Set `ui.hideLspStatus: true` in pi-lens's configuration. The LSP chip disappears and stays
   gone; the issues chip is unaffected.
6. Disable Zentui, or remove the `lens` or `issues` alias. pi-lens's normal statuses still reach
   the extension-status footer when you show it; enabling an alias again brings that chip back
   on the next repaint.
7. Run `/reload` twice. Each chip comes back exactly once — not twice, and not never.
8. Switch sessions. Neither previous session's chip lingers.
9. Set Zentui's custom-value colour mode to **Zentui**. The LSP chip renders unstyled but still
   reads `LSP ✓` / `LSP ✗`; the issues chip is unchanged.

## Retirement

The package exists because pi-lens publishes its statuses only through `ctx.ui.setStatus`. If
upstream publishes straight onto Zentui's custom-variable bus, delete this package entirely. If
it adds status events on `pi.events`, delete the tee (`src/tee.ts`) and feed each mirror from
those events; fitting, deduplication, retry and publication stay unchanged.

## Development

```sh
npm install
npm run typecheck
npm test
npm run format:check
```

Load the checkout in place for one session, without publishing it:

```sh
pi -e ./src/index.ts
```

CLI extensions load before installed packages, which is the required position: the tee exists
before `pi-lens` publishes. Do not also list the checkout in `packages` while using `-e`; pi
deduplicates the copy by resolved path and keeps the CLI one, which is already in the right slot.

For a persistent local install, make the checkout the **first** entry in the **global** `packages`
array in `~/.pi/agent/settings.json`, then **fully exit pi and start a fresh `pi`**:

```json
"packages": [
  "/Users/you/Documents/projects/pi-extensions/pi-lens-status",
  "npm:pi-lens",
  "npm:pi-zentui"
]
```

Run the hand checks above, then remove the entry. A full restart is required whenever the
package list or this entry's position changes. `/reload` keeps any `-e` extension first, which
is now the correct position, but a stale process started under the old order still has to be
replaced.
