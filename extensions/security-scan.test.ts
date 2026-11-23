import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "./security-scan";

let tmp: string;
let oldXdg: string | undefined;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "ss-ext-"));
  mkdirSync(join(tmp, "security-scan"), { recursive: true });
  writeFileSync(
    join(tmp, "security-scan", "scanned.txt"),
    "acme/clean\tLOW\t2026-01-01\nacme/risky\tHIGH\t2026-01-02\n",
  );
  oldXdg = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = tmp;
});
afterAll(() => {
  if (oldXdg === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = oldXdg;
  rmSync(tmp, { recursive: true, force: true });
});

function setup() {
  const handlers: Record<string, (...a: any[]) => any> = {};
  const sent: any[] = [];
  const notes: any[] = [];
  const pi = {
    on: (name: string, fn: any) => {
      handlers[name] = fn;
    },
    sendMessage: (msg: any, opts: any) => sent.push({ msg, opts }),
  };
  extension(pi as any);
  const ctx = { cwd: tmp, ui: { notify: (m: string, t: string) => notes.push({ m, t }) } };
  return { handlers, sent, notes, ctx };
}

describe("input + before_agent_start (D5)", () => {
  test("typed GitHub URL: continues unchanged, then injects suggestion once", async () => {
    const { handlers, ctx } = setup();
    const r = await handlers.input({ text: "look at https://github.com/o/r", source: "interactive" }, ctx);
    expect(r).toEqual({ action: "continue" });
    const b = await handlers.before_agent_start({ messageType: "user", prompt: "x" }, ctx);
    expect(b.message.customType).toBe("security-scan");
    expect(b.message.content).toContain("https://github.com/o/r");
    expect(b.message.content).toContain("/skill:security-scan");
    expect(await handlers.before_agent_start({ messageType: "user" }, ctx)).toBeUndefined();
  });

  test("no URL: nothing injected", async () => {
    const { handlers, ctx } = setup();
    await handlers.input({ text: "hello", source: "interactive" }, ctx);
    expect(await handlers.before_agent_start({ messageType: "user" }, ctx)).toBeUndefined();
  });

  test("non-interactive sources are ignored", async () => {
    const { handlers, ctx } = setup();
    for (const source of ["rpc", "extension"]) {
      const r = await handlers.input({ text: "https://github.com/o/r", source }, ctx);
      expect(r).toEqual({ action: "continue" });
      expect(await handlers.before_agent_start({ messageType: "user" }, ctx)).toBeUndefined();
    }
  });

  test("already invoking the skill: nothing injected", async () => {
    const { handlers, ctx } = setup();
    await handlers.input({ text: "/skill:security-scan https://github.com/o/r", source: "interactive" }, ctx);
    expect(await handlers.before_agent_start({ messageType: "user" }, ctx)).toBeUndefined();
  });

  test("a later input clears a stale suggestion", async () => {
    const { handlers, ctx } = setup();
    await handlers.input({ text: "https://github.com/o/r", source: "interactive" }, ctx);
    await handlers.input({ text: "never mind", source: "interactive" }, ctx);
    expect(await handlers.before_agent_start({ messageType: "user" }, ctx)).toBeUndefined();
  });
});

describe("tool_call (D14, D15)", () => {
  const call = (command: string, toolName = "bash") => ({ toolName, toolCallId: "1", input: { command } });

  test("unscanned clone: warns user and model, returns nothing", async () => {
    const { handlers, sent, notes, ctx } = setup();
    const r = await handlers.tool_call(call("git clone https://github.com/new/repo"), ctx);
    expect(r).toBeUndefined();
    expect(notes).toHaveLength(1);
    expect(notes[0].t).toBe("warning");
    expect(notes[0].m).toContain("never been scanned");
    expect(sent).toHaveLength(1);
    expect(sent[0].opts).toEqual({ deliverAs: "steer" });
    expect(sent[0].msg.content).toContain("new/repo");
  });

  test("HIGH-rated repo: warns", async () => {
    const { handlers, notes, ctx } = setup();
    await handlers.tool_call(call("git clone https://github.com/acme/risky"), ctx);
    expect(notes[0].m).toContain("last rated HIGH");
  });

  test("LOW-rated repo: silent", async () => {
    const { handlers, sent, notes, ctx } = setup();
    expect(await handlers.tool_call(call("git clone https://github.com/acme/clean"), ctx)).toBeUndefined();
    expect(notes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  test("unrelated command and non-bash tool: silent", async () => {
    const { handlers, sent, notes, ctx } = setup();
    expect(await handlers.tool_call(call("ls -la"), ctx)).toBeUndefined();
    expect(await handlers.tool_call(call("git clone https://github.com/new/repo", "read"), ctx)).toBeUndefined();
    expect(notes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  test("never blocks, even when ui or sendMessage throws", async () => {
    const { handlers } = setup();
    const r = await handlers.tool_call(call("git clone https://github.com/new/repo"), {
      cwd: tmp,
      ui: { notify: () => { throw new Error("boom"); } },
    });
    expect(r).toBeUndefined();
  });

  test("malformed event: silent", async () => {
    const { handlers, ctx } = setup();
    expect(await handlers.tool_call({ toolName: "bash", input: {} }, ctx)).toBeUndefined();
  });
});
