import { describe, expect, test } from "bun:test";
import { copyText, type ClipboardEnv } from "./clipboard";

// A stand-in for the DOM: records what the textarea fallback copies and whether it cleaned up.
function fakeDocument(copies: boolean) {
  const state = { copied: null as string | null, attached: 0, refocused: false };
  const area = { value: "", style: {} as Record<string, string>, setAttribute() {}, select() {} };
  const document = {
    activeElement: { focus: () => (state.refocused = true) },
    createElement: () => area,
    execCommand: (command: string) => {
      if (command === "copy" && copies) state.copied = area.value;
      return copies;
    },
    body: { appendChild: () => state.attached++, removeChild: () => state.attached-- },
  } as unknown as ClipboardEnv["document"];
  return { document, state };
}

describe("copyText", () => {
  test("uses the Clipboard API on a secure page", async () => {
    const written: string[] = [];
    const { document, state } = fakeDocument(true);
    await copyText("prompt", { clipboard: { writeText: async (t) => void written.push(t) }, document });
    expect(written).toEqual(["prompt"]);
    expect(state.copied).toBeNull();
  });

  test("without it (plain HTTP over the network) it copies through a textarea and removes it", async () => {
    const { document, state } = fakeDocument(true);
    await copyText("prompt", { clipboard: undefined, document });
    expect(state).toEqual({ copied: "prompt", attached: 0, refocused: true });
  });

  test("a denied Clipboard API falls back too", async () => {
    const { document, state } = fakeDocument(true);
    await copyText("prompt", { clipboard: { writeText: () => Promise.reject(new Error("denied")) }, document });
    expect(state.copied).toBe("prompt");
  });

  test("rejects when neither works, so the button can say so", async () => {
    const { document, state } = fakeDocument(false);
    await expect(copyText("prompt", { clipboard: undefined, document })).rejects.toThrow();
    expect(state.attached).toBe(0);
  });
});
