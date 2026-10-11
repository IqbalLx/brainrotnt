// Browsers only expose navigator.clipboard on secure pages (HTTPS or localhost). Opened over the network
// (`brnt --network`, a LAN or Tailscale address on plain HTTP) it is undefined, so fall back to copying a
// selected textarea, which still works there.

export interface ClipboardEnv {
  clipboard?: Pick<Clipboard, "writeText">;
  document: Pick<Document, "createElement" | "execCommand" | "activeElement"> & { body: Pick<HTMLElement, "appendChild" | "removeChild"> };
}

const browser = (): ClipboardEnv => ({ clipboard: window.isSecureContext ? navigator.clipboard : undefined, document });

/** Copies text; rejects when neither way works, so the caller can ask the person to select it. */
export async function copyText(text: string, env: ClipboardEnv = browser()): Promise<void> {
  if (env.clipboard) {
    try {
      return await env.clipboard.writeText(text);
    } catch {
      // Denied (no focus, a permissions policy): the fallback may still work.
    }
  }
  const { document } = env;
  const focused = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off screen, and fixed so selecting it does not scroll the page.
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    if (!document.execCommand("copy")) throw new Error("copy was refused");
  } finally {
    document.body.removeChild(area);
    focused?.focus?.();
  }
}
