import { describe, expect, it } from "bun:test";
import { isAgentPane } from "./uhp-client";

describe("isAgentPane", () => {
  it("rejects panes Luvus only knows by their running command", () => {
    // What Luvus sends while atuin (or any shell command) runs in a plain zsh pane.
    expect(isAgentPane({ agent: "zsh", authority: "command_fallback", state_source: "shell_activity", status: "working" })).toBe(false);
  });

  it("accepts panes identified as agents", () => {
    expect(isAgentPane({ agent: "claude", authority: "process_tree", status: "working" })).toBe(true);
    expect(isAgentPane({ agent: "codex", authority: "osc_title", status: "blocked" })).toBe(true);
  });

  it("accepts panes from a Luvus that does not report authority", () => {
    expect(isAgentPane({ agent: "claude", status: "working" })).toBe(true);
  });
});
