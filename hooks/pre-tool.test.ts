import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "pre-tool.ts");
let tmp: string;
let cache: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "pre-tool-"));
  cache = join(tmp, "cache");
  mkdirSync(join(cache, "security-scan"), { recursive: true });
  writeFileSync(
    join(cache, "security-scan", "scanned.txt"),
    "acme/clean\tLOW\t2026-01-01\nacme/risky\tHIGH\t2026-01-02\nacme/bad\tCRITICAL\t2026-01-03\n",
  );
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function run(harness: string, stdin: string) {
  const proc = Bun.spawn(["bun", SCRIPT, harness], {
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, XDG_CACHE_HOME: cache },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

const claudeIn = (command: string) =>
  JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: tmp });
const codexIn = (command: string) =>
  JSON.stringify({ hook_event_name: "PreToolUse", turn_id: "t1", tool_name: "Bash", tool_input: { command }, cwd: tmp });
const agyIn = (command: string) =>
  JSON.stringify({
    toolCall: { name: "run_command", args: { CommandLine: command, Cwd: tmp } },
    stepIdx: 1,
    conversationId: "c1",
    workspacePaths: [tmp],
  });

function noBlocking(out: string) {
  expect(out).not.toMatch(/"(deny|block|ask|force_ask)"/);
  expect(out).not.toContain("permissionDecision");
}

describe("claude and codex", () => {
  for (const [name, mk] of [["claude", claudeIn], ["codex", codexIn]] as const) {
    test(`${name}: unscanned clone warns via additionalContext`, async () => {
      const r = await run(name, mk("git clone https://github.com/acme/new.git"));
      expect(r.code).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
      expect(out.hookSpecificOutput.additionalContext).toContain("acme/new");
      expect(out.hookSpecificOutput.additionalContext).toContain("never been scanned");
      expect(Object.keys(out)).toEqual(["hookSpecificOutput"]);
      noBlocking(r.stdout);
    });

    test(`${name}: HIGH and CRITICAL warn`, async () => {
      for (const [repo, rating] of [["acme/risky", "HIGH"], ["acme/bad", "CRITICAL"]]) {
        const r = await run(name, mk(`git clone https://github.com/${repo}`));
        expect(r.code).toBe(0);
        expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain(`rated ${rating}`);
        noBlocking(r.stdout);
      }
    });

    test(`${name}: LOW-rated repo is silent`, async () => {
      const r = await run(name, mk("git clone https://github.com/acme/clean"));
      expect(r).toEqual({ stdout: "", stderr: "", code: 0 });
    });

    test(`${name}: unrelated command is silent`, async () => {
      const r = await run(name, mk("ls -la"));
      expect(r).toEqual({ stdout: "", stderr: "", code: 0 });
    });
  }
});

describe("antigravity", () => {
  test("unscanned clone warns with decision allow", async () => {
    const r = await run("antigravity", agyIn("git clone https://github.com/acme/new.git"));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.decision).toBe("allow");
    expect(out.reason).toContain("acme/new");
    expect(r.stderr).toContain("acme/new");
    noBlocking(r.stdout);
  });

  test("scanned LOW repo and unrelated command give plain allow", async () => {
    for (const cmd of ["git clone https://github.com/acme/clean", "ls"]) {
      const r = await run("antigravity", agyIn(cmd));
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ decision: "allow" });
    }
  });

  test("other tool names are ignored", async () => {
    const stdin = JSON.stringify({
      toolCall: { name: "view_file", args: { AbsolutePath: "/x" } },
      workspacePaths: [tmp],
    });
    const r = await run("antigravity", stdin);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ decision: "allow" });
  });
});

describe("robustness", () => {
  test("bad JSON, empty stdin and unknown harness exit 0", async () => {
    for (const [h, s] of [["claude", "not json"], ["codex", ""], ["antigravity", "{"], ["bogus", "{}"]]) {
      const r = await run(h, s);
      expect(r.code).toBe(0);
      noBlocking(r.stdout);
    }
  });
});
