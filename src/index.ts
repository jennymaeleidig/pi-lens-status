import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { PUBLISHER_KEYS, STATUS_KEYS, type StatusKey } from "./keys.ts";
import { mirror } from "./mirror.ts";
import type { Tee } from "./tee.ts";
import { createTee } from "./tee.ts";

const CAPABILITY_EVENT = "zentui:variable-capability";
const VARIABLE_EVENT = "zentui:variable";

/** How long a startup value waits for Zentui's first active verdict. */
const RETRY_MS = 100;
const RETRY_LIMIT = 30;

/** The mutable probe Zentui answers in place. */
type Probe = { supported: boolean; active: boolean; key: string };

/** One mirrored status key's independent retained value and retry state. */
type Slot = {
  readonly publisherKey: string;
  previous: string | undefined;
  latest: string | undefined;
  retry: ReturnType<typeof setTimeout> | undefined;
  attempts: number;
};

function createSlot(key: StatusKey): Slot {
  return {
    publisherKey: PUBLISHER_KEYS[key],
    previous: undefined,
    latest: undefined,
    retry: undefined,
    attempts: 0,
  };
}

/**
 * Mirror the status texts pi-lens publishes into Zentui border slots. The tee
 * is installed on the bind's `ui` object at session start, forwards every call,
 * and copies only the ones under a key this package knows. Each key keeps its
 * own retained value, dedupe, and retry state. All mutable state lives here.
 */
export default function piLensStatus(pi: ExtensionAPI): void {
  let ui: ExtensionUIContext | undefined;
  let tee: Tee | undefined;
  const slots: Record<StatusKey, Slot> = {
    "pi-lens-lsp": createSlot("pi-lens-lsp"),
    "pi-lens-issues": createSlot("pi-lens-issues"),
  };

  const stopRetry = (slot: Slot): void => {
    if (slot.retry !== undefined) {
      clearTimeout(slot.retry);
      slot.retry = undefined;
    }
    slot.attempts = 0;
  };

  /** Probe, mirror one slot's retained value, and report whether Zentui is active. */
  const refresh = (slot: Slot): boolean => {
    const target = ui;
    const activeTee = tee;
    if (target === undefined || activeTee === undefined) return false;

    // A later tee may have taken the own property since the last publish.
    activeTee.ensure(target);

    const probe: Probe = { supported: false, active: false, key: slot.publisherKey };
    pi.events.emit(CAPABILITY_EVENT, probe);
    const active = probe.active === true;

    const result = mirror(slot.previous, slot.latest, active);
    slot.previous = result.text;
    if (result.publish) {
      pi.events.emit(VARIABLE_EVENT, { key: slot.publisherKey, text: result.text });
    }
    return active;
  };

  /** Retry one slot's rejected startup value every RETRY_MS, at most RETRY_LIMIT times. */
  const startRetry = (slot: Slot): void => {
    if (slot.retry !== undefined) return;
    slot.attempts = 0;
    slot.retry = setTimeout(function tick(): void {
      slot.retry = undefined;
      if (ui === undefined || tee === undefined) return;
      try {
        if (refresh(slot) || ++slot.attempts >= RETRY_LIMIT) return;
      } catch {
        // Failure containment: a retry never escapes as an uncaught timer throw.
        return;
      }
      slot.retry = setTimeout(tick, RETRY_MS);
    }, RETRY_MS);
  };

  const publish = (key: StatusKey, raw: string | undefined): void => {
    const slot = slots[key];
    // A text of the wrong type is nothing to do: keep the retained value and
    // let any pending retry continue.
    if (raw !== undefined && typeof raw !== "string") return;
    slot.latest = raw;
    if (refresh(slot) || raw === undefined) {
      stopRetry(slot);
      return;
    }
    startRetry(slot);
  };

  const resetSlot = (slot: Slot): void => {
    slot.previous = undefined;
    slot.latest = undefined;
    stopRetry(slot);
  };

  /** Restore the previous bind and discard every session value. */
  const reset = (): void => {
    if (ui !== undefined && tee !== undefined) tee.restore(ui);
    ui = undefined;
    tee = undefined;
    for (const key of STATUS_KEYS) resetSlot(slots[key]);
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
      for (const key of STATUS_KEYS) {
        const slot = slots[key];
        if (slot.previous !== undefined) {
          pi.events.emit(VARIABLE_EVENT, { key: slot.publisherKey, text: undefined });
        }
      }
      reset();
    } catch {
      // Failure containment: no throw from this package reaches pi's session shutdown.
    }
  });
}
