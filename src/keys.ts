/**
 * The two pi-lens status keys this bridge mirrors, and the fixed Zentui
 * publisher key each one is republished under.
 */

/** Every status key the tee copies. */
export const STATUS_KEYS = ["pi-lens-lsp", "pi-lens-issues"] as const;

/** One pi-lens status key. */
export type StatusKey = (typeof STATUS_KEYS)[number];

const STATUS_KEY_SET: ReadonlySet<string> = new Set(STATUS_KEYS);

/** Whether `key` is a status key this package mirrors. */
export function isStatusKey(key: string): key is StatusKey {
  return STATUS_KEY_SET.has(key);
}

/** The stable Zentui publisher key for each mirrored status. */
export const PUBLISHER_KEYS: Readonly<Record<StatusKey, string>> = {
  "pi-lens-lsp": "pi-lens-status:lsp",
  "pi-lens-issues": "pi-lens-status:issues",
};
