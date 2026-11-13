import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { mirror } from "./mirror.ts";
import type { Tee } from "./tee.ts";
import { createTee } from "./tee.ts";

/** The fixed publisher key every value is published under. */
const PUBLISHER_KEY = "pi-lens-status:lsp";
const CAPABILITY_EVENT = "zentui:variable-capability";
const VARIABLE_EVENT = "zentui:variable";

/** How long a startup value waits for Zentui's first active verdict. */
const RETRY_MS = 100;
const RETRY_LIMIT = 30;

/** The mutable probe Zentui answers in place. */
type Probe = { supported: boolean; active: boolean; key: string };

/**
 * Mirror pi-lens's `pi-lens-lsp` status text into a Zentui border slot. The tee
 * is installed on the bind's `ui` object at session start, forwards every call,
 * and copies only the ones keyed `pi-lens-lsp`. All mutable state lives here.
 */
export default function piLensStatus(pi: ExtensionAPI): void {
  let ui: ExtensionUIContext | undefined;
  let tee: Tee | undefined;
  let previous: string | undefined;
  /** The last value pi-lens wrote, kept so a retry can publish it once active. */
  let latest: string | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;

  const stopRetry = (): void => {
    if (retry !== undefined) {
      clearTimeout(retry);
      retry = undefined;
    }
    attempts = 0;
  };

  /** Probe, mirror the retained value, and report whether Zentui is active. */
  const refresh = (): boolean => {
    const target = ui;
    const activeTee = tee;
    if (target === undefined || activeTee === undefined) return false;

    // A later tee may have taken the own property since the last publish.
    activeTee.ensure(target);

    const probe: Probe = { supported: false, active: false, key: PUBLISHER_KEY };
    pi.events.emit(CAPABILITY_EVENT, probe);
    const active = probe.active === true;

    const result = mirror(previous, latest, active);
    previous = result.text;
    if (result.publish) {
      pi.events.emit(VARIABLE_EVENT, { key: PUBLISHER_KEY, text: result.text });
    }
    return active;
  };

  /**
   * Zentui may report inactive before its editor is decorated, and it drops
   * positive updates while inactive. Retry a rejected startup value briefly,
   * then stop; a later pi-lens publish retries again.
   */
  const startRetry = (): void => {
    if (retry !== undefined) return;
    attempts = 0;
    retry = setTimeout(function tick(): void {
      retry = undefined;
      if (ui === undefined || tee === undefined) return;
      try {
        if (refresh() || ++attempts >= RETRY_LIMIT) return;
      } catch {
        // Failure containment: a retry never escapes as an uncaught timer throw.
        return;
      }
      retry = setTimeout(tick, RETRY_MS);
    }, RETRY_MS);
  };

  const publish = (raw: string | undefined): void => {
    latest = raw;
    if (refresh() || raw === undefined) {
      stopRetry();
      return;
    }
    startRetry();
  };

  /** Restore the previous bind and discard every session value. */
  const reset = (): void => {
    if (ui !== undefined && tee !== undefined) tee.restore(ui);
    ui = undefined;
    tee = undefined;
    previous = undefined;
    latest = undefined;
    stopRetry();
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    try {
      reset();

      const target = ctx.ui;
      const next = createTee(publish);
      if (!next.install(target)) return;
      ui = target;
      tee = next;
    } catch {
      // Failure containment: no throw from this package reaches pi's session start.
    }
  });

  pi.on("session_shutdown", () => {
    try {
      if (previous !== undefined) {
        pi.events.emit(VARIABLE_EVENT, { key: PUBLISHER_KEY, text: undefined });
      }
      reset();
    } catch {
      // Failure containment: no throw from this package reaches pi's session shutdown.
    }
  });
}
