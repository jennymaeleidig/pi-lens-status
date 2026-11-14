import assert from "node:assert/strict";
import { test } from "node:test";
import { createTee } from "../src/tee.ts";
import type { FakeUi, Harness } from "./helpers.ts";
import { createHarness, createUi, probes, variables } from "./helpers.ts";

const PUBLISHER_KEY = "pi-lens-status:lsp";
const LENS_KEY = "pi-lens-lsp";

async function started(
  options: { zentuiActive?: boolean } = {},
): Promise<{ harness: Harness; fake: FakeUi }> {
  const harness = createHarness();
  const fake = createUi();
  harness.setZentuiActive(options.zentuiActive ?? true);
  await harness.start({ ui: fake.ui });
  return { harness, fake };
}

test("the tee installs, forwards every lens call unchanged, and shutdown restores it", async () => {
  const harness = createHarness();
  const fake = createUi();
  const before = Object.getOwnPropertyDescriptor(fake.ui, "setStatus");

  await harness.start({ ui: fake.ui });
  const installed = Object.getOwnPropertyDescriptor(fake.ui, "setStatus");
  assert.ok(installed !== undefined);
  assert.notEqual(installed.value, before?.value);

  fake.ui.setStatus(LENS_KEY, "\u001b[32mLSP ✓\u001b[0m");
  fake.ui.setStatus(LENS_KEY, "\u001b[31mLSP ✗\u001b[0m");
  fake.ui.setStatus(LENS_KEY, "\u001b[2mLSP ✗\u001b[0m");

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "\u001b[32mLSP ✓\u001b[0m" },
    { key: PUBLISHER_KEY, text: "\u001b[31mLSP ✗\u001b[0m" },
    { key: PUBLISHER_KEY, text: "\u001b[2mLSP ✗\u001b[0m" },
  ]);

  assert.deepEqual(fake.calls, [
    { key: LENS_KEY, text: "\u001b[32mLSP ✓\u001b[0m" },
    { key: LENS_KEY, text: "\u001b[31mLSP ✗\u001b[0m" },
    { key: LENS_KEY, text: "\u001b[2mLSP ✗\u001b[0m" },
  ]);
  assert.ok(
    fake.calls.every((call) => call.key !== PUBLISHER_KEY),
    "this package never writes its own publisher key to ctx.ui.setStatus",
  );

  await harness.shutdown({ ui: fake.ui });
  assert.deepEqual(Object.getOwnPropertyDescriptor(fake.ui, "setStatus"), before);
  assert.deepEqual(variables(harness).at(-1), { key: PUBLISHER_KEY, text: undefined });
});

test("a duplicate of the previously published value emits nothing", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(LENS_KEY, "LSP ✓");

  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);
});

test("undefined and empty text each remove the value", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(LENS_KEY, undefined);
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(LENS_KEY, "");

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: PUBLISHER_KEY, text: undefined },
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: PUBLISHER_KEY, text: undefined },
  ]);
});

test("a wrong-typed value publishes nothing and still forwards", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  const wrongType = 42 as unknown as string;
  fake.ui.setStatus(LENS_KEY, wrongType);

  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);
  assert.equal(fake.calls.at(-1)?.text, wrongType);
});

test("a call under another key forwards unchanged and publishes nothing", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus("pi-lens-widget", "LSP summary");
  fake.ui.setStatus("pi-vim-status:vim", "NORMAL");

  assert.deepEqual(variables(harness), []);
  assert.deepEqual(fake.calls, [
    { key: "pi-lens-widget", text: "LSP summary" },
    { key: "pi-vim-status:vim", text: "NORMAL" },
  ]);
});

test("an inactive Zentui verdict clears the retained value", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  harness.setZentuiActive(false);
  fake.ui.setStatus(LENS_KEY, "LSP ✓");

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: PUBLISHER_KEY, text: undefined },
  ]);
});

test("every refresh emits a fresh mutable capability probe for the publisher key", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(LENS_KEY, "LSP ✗");

  const emitted = probes(harness);
  assert.equal(emitted.length, 2);
  assert.notEqual(emitted[0], emitted[1]);
  for (const probe of emitted) {
    assert.deepEqual(
      { supported: probe.supported, key: probe.key },
      { supported: false, key: PUBLISHER_KEY },
    );
    assert.equal(Object.isFrozen(probe), false);
  }
});

test("a rejected startup value is retried when Zentui becomes active, then stops", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { harness, fake } = await started({ zentuiActive: false });
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  assert.deepEqual(variables(harness), [], "the inactive probe drops the startup value");

  harness.setZentuiActive(true);
  t.mock.timers.tick(100);
  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);

  const afterSuccess = probes(harness).length;
  t.mock.timers.tick(1000);
  assert.equal(probes(harness).length, afterSuccess, "the retry stops on success");
});

test("the retry is bounded", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { harness, fake } = await started({ zentuiActive: false });
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  for (let i = 0; i < 60; i += 1) t.mock.timers.tick(100);

  assert.equal(probes(harness).length, 31, "one publish probe plus thirty retries");
  assert.deepEqual(variables(harness), []);
});

test("shutdown cancels a pending retry and emits no removal without a published value", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { harness, fake } = await started({ zentuiActive: false });
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  await harness.shutdown({ ui: fake.ui });
  harness.setZentuiActive(true);
  t.mock.timers.tick(5000);

  assert.deepEqual(variables(harness), []);
});

test("a later tee stacked above this one lets both consume their own keys", async () => {
  const { harness, fake } = await started();

  const laterCalls: Array<{ key: string; text: string | undefined }> = [];
  const earlier = fake.ui.setStatus;
  Object.defineProperty(fake.ui, "setStatus", {
    configurable: true,
    writable: true,
    enumerable: true,
    value(this: unknown, key: string, text: string | undefined): void {
      if (key === "pi-vim-status:vim") laterCalls.push({ key, text });
      earlier.call(this, key, text);
    },
  });

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus("pi-vim-status:vim", "NORMAL");

  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);
  assert.deepEqual(laterCalls, [{ key: "pi-vim-status:vim", text: "NORMAL" }]);
});

test("a second session_start on a new ui restores the old object and starts clean", async () => {
  const harness = createHarness();
  const first = createUi();
  const second = createUi();
  const beforeFirst = Object.getOwnPropertyDescriptor(first.ui, "setStatus");
  const beforeSecond = Object.getOwnPropertyDescriptor(second.ui, "setStatus");

  await harness.start({ ui: first.ui });
  first.ui.setStatus(LENS_KEY, "LSP ✓");
  await harness.start({ ui: second.ui });

  assert.deepEqual(Object.getOwnPropertyDescriptor(first.ui, "setStatus"), beforeFirst);
  assert.notEqual(
    Object.getOwnPropertyDescriptor(second.ui, "setStatus")?.value,
    beforeSecond?.value,
  );

  second.ui.setStatus(LENS_KEY, "LSP ✗");
  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: PUBLISHER_KEY, text: "LSP ✗" },
  ]);
});

test("a later tee installed over ours still reaches both consumers", async () => {
  const { harness, fake } = await started();

  // A later bridge installs above us after our session start.
  const later = createTee(() => {});
  later.install(fake.ui);

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);
});

test("over-limit text is fitted with an ellipsis and a closing reset within the limit", async () => {
  const { harness, fake } = await started();

  const styled = `\u001b[32mLSP ✓ ${"x".repeat(300)}\u001b[0m`;
  fake.ui.setStatus(LENS_KEY, styled);
  const fitted = variables(harness).at(-1)?.text ?? "";

  assert.equal(fitted.length, 256, `fitted length ${fitted.length} does not use the full budget`);
  assert.ok(fitted.startsWith("\u001b[32m"));
  assert.ok(fitted.includes("…"));
  assert.ok(fitted.endsWith("\u001b[0m"));

  const plain = "y".repeat(300);
  fake.ui.setStatus(LENS_KEY, plain);
  const plainFitted = variables(harness).at(-1)?.text ?? "";

  assert.equal(plainFitted.length, 256);
  assert.ok(plainFitted.endsWith("…"));
  assert.equal(plainFitted.includes("\u001b[0m"), false);
});

test("a malformed publication during a pending retry leaves the retry and value alone", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { harness, fake } = await started({ zentuiActive: false });
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  const probesBefore = probes(harness).length;
  harness.setZentuiActive(true);

  const wrongType = 42 as unknown as string;
  fake.ui.setStatus(LENS_KEY, wrongType);
  assert.equal(probes(harness).length, probesBefore, "the malformed publication emits no probe");
  assert.deepEqual(variables(harness), [], "the malformed publication mirrors nothing");

  t.mock.timers.tick(100);
  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);
  assert.equal(fake.calls.at(-1)?.text, wrongType, "the malformed call still forwards");
});

test("an over-limit cut never splits an SGR sequence", async () => {
  const { harness, fake } = await started();

  const prefix = "a".repeat(252);
  fake.ui.setStatus(LENS_KEY, `${prefix}\u001b[31m${"b".repeat(100)}`);
  const fitted = variables(harness).at(-1)?.text ?? "";

  assert.equal(fitted, `${prefix}…`);
  assert.equal(fitted.includes("\u001b"), false, "no partial escape survives the cut");
});

test("retained SGR gets exactly one trailing reset", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, `\u001b[32m${"x".repeat(300)}\u001b[0m`);
  const fitted = variables(harness).at(-1)?.text ?? "";

  assert.equal(fitted.length, 256);
  assert.ok(fitted.startsWith("\u001b[32m"));
  assert.ok(fitted.endsWith("…\u001b[0m"));
  assert.equal(fitted.split("\u001b[0m").length - 1, 1);
});

test("fitted text never exceeds the protocol limit", async () => {
  const { harness, fake } = await started();

  for (let length = 245; length <= 260; length += 1) {
    fake.ui.setStatus(LENS_KEY, `\u001b[1;31m${"x".repeat(length)}\u001b[0m`);
    const fitted = variables(harness).at(-1)?.text ?? "";
    assert.ok(fitted.length <= 256, `length ${fitted.length} exceeds the limit`);
  }
});

test("under-limit SGR text passes through unchanged", async () => {
  const { harness, fake } = await started();

  const text = "\u001b[32mLSP ✓\u001b[0m";
  fake.ui.setStatus(LENS_KEY, text);

  assert.equal(variables(harness).at(-1)?.text, text);
});

test("a non-TUI session installs nothing and emits nothing", async () => {
  const harness = createHarness();
  const fake = createUi();
  const before = Object.getOwnPropertyDescriptor(fake.ui, "setStatus");

  await harness.start({ ui: fake.ui, mode: "print" });
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  await harness.shutdown({ ui: fake.ui, mode: "print" });

  assert.deepEqual(Object.getOwnPropertyDescriptor(fake.ui, "setStatus"), before);
  assert.deepEqual(variables(harness), []);
  assert.deepEqual(harness.emitted, []);
});

// --- pi-lens-issues: the second mirrored channel ---

const ISSUES_KEY = "pi-lens-issues";
const ISSUES_PUBLISHER_KEY = "pi-lens-status:issues";

test("mirrors the issues status under its own key, independently of the LSP status", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(ISSUES_KEY, "●2E !3W");
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(ISSUES_KEY, "✓ clean");

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: ISSUES_PUBLISHER_KEY, text: "●2E !3W" },
    { key: ISSUES_PUBLISHER_KEY, text: "✓ clean" },
  ]);
});

test("a removal on one channel leaves the other published", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(ISSUES_KEY, "●1E");
  fake.ui.setStatus(ISSUES_KEY, undefined);

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: ISSUES_PUBLISHER_KEY, text: "●1E" },
    { key: ISSUES_PUBLISHER_KEY, text: undefined },
  ]);
});

test("an inactive Zentui verdict clears both retained values", async () => {
  const { harness, fake } = await started();

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(ISSUES_KEY, "●1E");
  harness.setZentuiActive(false);
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(ISSUES_KEY, "●1E");

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: ISSUES_PUBLISHER_KEY, text: "●1E" },
    { key: PUBLISHER_KEY, text: undefined },
    { key: ISSUES_PUBLISHER_KEY, text: undefined },
  ]);
});

test("a rejected issues publication retries independently of the LSP channel", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { harness, fake } = await started({ zentuiActive: false });

  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  fake.ui.setStatus(ISSUES_KEY, "●1E");
  harness.setZentuiActive(true);
  t.mock.timers.tick(100);

  assert.deepEqual(variables(harness), [
    { key: PUBLISHER_KEY, text: "LSP ✓" },
    { key: ISSUES_PUBLISHER_KEY, text: "●1E" },
  ]);
});

test("a failed write under either mirrored key is contained; another key still throws", async () => {
  const harness = createHarness();
  const fake = createUi();
  const original = fake.ui.setStatus;
  fake.ui.setStatus = function (this: unknown, key: string, text: string | undefined): void {
    if (key === ISSUES_KEY) throw new Error("issues failed");
    if (key === "other") throw new Error("other failed");
    original.call(this, key, text);
  };

  await harness.start({ ui: fake.ui });

  assert.doesNotThrow(() => fake.ui.setStatus(ISSUES_KEY, "●1E"));
  fake.ui.setStatus(LENS_KEY, "LSP ✓");
  assert.deepEqual(variables(harness), [{ key: PUBLISHER_KEY, text: "LSP ✓" }]);
  assert.throws(() => fake.ui.setStatus("other", "x"), /other failed/);
});
