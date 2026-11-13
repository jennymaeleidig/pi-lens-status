# pi-lens-status

Show pi-lens's LSP status in a Zentui Minimalist border slot, beside your IDE and Vim mode
chips — and nothing at all when pi-lens publishes no LSP status.

> Status: implemented for the first end-to-end slice. The design is settled and written down in
> [`GLOSSARY.md`](GLOSSARY.md) and the three architectural bets in
> [`docs/adr/0001-tee-pi-lens-lsp-publication.md`](docs/adr/0001-tee-pi-lens-lsp-publication.md),
> [`docs/adr/0002-mirror-only-no-fallback-write.md`](docs/adr/0002-mirror-only-no-fallback-write.md),
> and [`docs/adr/0003-retry-the-startup-value.md`](docs/adr/0003-retry-the-startup-value.md).

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
startup LSP status from its own `session_start`; loaded after it, the tee misses that first text
and the chip stays empty until the next LSP status repaint. Zentui or another bridge may install
its own controller over the tee later in the same start, so every publish re-installs the tee
above it.

`pi install` appends to `packages`. If `pi-lens-status`, `pi-lens` or `pi-zentui` is already
installed, put the `pi-lens-status` source first in the array and restart. Update the git source
with `pi update git:github.com/jennymaeleidig/pi-lens-status`.

## Configuration

Two things make the chip visible. This package writes neither of them and reads neither file.

1. **pi-lens uses the compact LSP status.** In `~/.pi-lens/config.json` (the global pi-lens
   configuration), set:

   ```json
   { "ui": { "compactLspStatus": true } }
   ```

   The chip is pi-lens's own text: `LSP ✓` in the success role, `LSP ✗` in the error role, and a
   dim `LSP ✗` when nothing is warm. With compact off, pi-lens publishes the full server list,
   which is longer and fitted to the protocol limit. `ui.hideLspStatus: true` suppresses
   `pi-lens-lsp` entirely, so the chip stays gone; this package follows that setting by doing
   nothing else.

2. **Zentui names the publisher key and references it in a slot.** In the `minimalist` style,
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
               "lens": "pi-lens-status:lsp"
             },
             "formats": {
               "bottomRight": "$ide$join_sep$vim$join_sep$lens"
             }
           }
         }
       }
     }
   }
   ```

   The alias value is the full publisher key, not a short name. `$join_sep` is conditional: an
   absent chip leaves no dangling separator, so `$ide · $vim` still reads correctly. Without both
   the alias and a slot that references it, Zentui reports the key as not active and the chip can
   only reach the `$extensions` aggregate.

Zentui's **Custom value colors** setting works as usual. Original (the default) renders the safe
SGR sequences pi-lens publishes, so success, error and dim keep their meaning. Zentui strips the
styling and still shows the text.

## Duplicate surface, accepted

If you later enable Zentui's Starship Footer, alias `pi-lens-status:lsp` there too, **and** make
`pi-lens-lsp` visible in extension statuses, the same value can appear twice. This package does
not remove or rewrite pi-lens's own `pi-lens-lsp` publication, so it will not police another
publisher's key. Leave one of the surfaces off.

The extension-status footer is a separate surface. This package never writes `pi-lens-lsp` and
never publishes under its own key there, so enabling that footer later still shows exactly what
pi-lens wrote, once.

## Test by hand

With the configuration above and the checkout loaded first (see Development):

1. Open a TypeScript project with a known error so pi-lens warms a server. The chip reads
   `LSP ✓` beside `$ide · $vim` before your first prompt. `/lens-health` agrees with it.
2. Break the language-server configuration and start a new session. The chip reads `LSP ✗` in
   the error role.
3. Start a new session with no warm servers. The chip reads a dim `LSP ✗`.
4. Set `ui.hideLspStatus: true` in pi-lens's configuration. The chip disappears and stays gone.
5. Disable Zentui, or remove the `lens` alias. pi-lens's normal status still reaches the
   extension-status footer when you show it; enabling the alias again brings the chip back on
   the next pi-lens repaint.
6. Run `/reload` twice. The chip comes back exactly once — not twice, and not never.
7. Switch sessions. The previous session's LSP chip does not linger.
8. Set Zentui's custom-value colour mode to **Zentui**. The chip renders unstyled but still
   reads `LSP ✓` / `LSP ✗`.

## Retirement

The package exists because pi-lens publishes LSP status only through `ctx.ui.setStatus`. If
upstream publishes straight onto Zentui's custom-variable bus, delete this package entirely. If
it adds a status event on `pi.events`, delete the tee (`src/tee.ts`) and feed the mirror from
that event; fitting, deduplication, retry and publication stay unchanged.

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
