import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "url-hint.ts");
let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "url-hint-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function run(args: string[], stdin: string) {
  const proc = Bun.spawn(["bun", SCRIPT, ...args], {
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, XDG_CACHE_HOME: tmp },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

const claudeIn = (prompt: string) =>
  JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s1", prompt });
const codexIn = (prompt: string) =>
  JSON.stringify({ hook_event_name: "UserPromptSubmit", turn_id: "t1", prompt });
const agyIn = (lastUserInput: string, conversationId = "c1", invocationNum = 1) =>
  JSON.stringify({ lastUserInput, conversationId, invocationNum });

const URL_PROMPT = "please look at https://github.com/acme/widget.git today";

function noBlocking(out: string) {
  expect(out).not.toMatch(/"(deny|block|ask|force_ask|decision)"/);
}

describe("claude and codex", () => {
  for (const [harness, mk] of [
    ["claude", claudeIn],
    ["codex", codexIn],
  ] as const) {
    test(`${harness}: URL gives additionalContext`, async () => {
      const r = await run([harness], mk(URL_PROMPT));
      expect(r.code).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
      expect(out.hookSpecificOutput.additionalContext).toContain("https://github.com/acme/widget");
      expect(out.hookSpecificOutput.additionalContext).not.toContain(".git");
      noBlocking(r.stdout);
    });

    test(`${harness}: no URL prints nothing`, async () => {
      const r = await run([harness], mk("just fix the bug"));
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    });

    test(`${harness}: skill already invoked prints nothing`, async () => {
      const r = await run([harness], mk("/security-scan https://github.com/acme/widget"));
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    });
  }

  test("claude suggestion names the claude invocation", async () => {
    const r = await run(["claude"], claudeIn(URL_PROMPT));
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain("/security-scan:security-scan");
  });
});

describe("antigravity", () => {
  test("URL gives injectSteps ephemeralMessage", async () => {
    const r = await run(["antigravity"], agyIn("scan github.com/acme/agy-one", "c-a"));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.injectSteps).toHaveLength(1);
    expect(out.injectSteps[0].ephemeralMessage).toContain("https://github.com/acme/agy-one");
    noBlocking(r.stdout);
  });

  test("second model call of the same turn prints nothing (D4)", async () => {
    const first = await run(["antigravity"], agyIn("see github.com/acme/agy-two", "c-b", 1));
    const second = await run(["antigravity"], agyIn("see github.com/acme/agy-two", "c-b", 2));
    expect(first.stdout).not.toBe("");
    expect(second.code).toBe(0);
    expect(second.stdout).toBe("");
  });

  test("a new prompt in the same conversation is suggested again", async () => {
    await run(["antigravity"], agyIn("see github.com/acme/agy-three", "c-c"));
    const r = await run(["antigravity"], agyIn("now github.com/acme/agy-four", "c-c"));
    expect(JSON.parse(r.stdout).injectSteps[0].ephemeralMessage).toContain("acme/agy-four");
  });

  test("no URL prints nothing", async () => {
    const r = await run(["antigravity"], agyIn("fix the bug", "c-d"));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("bad input", () => {
  const bad = ["", "not json", "null", "[]", "{}", '{"prompt":42}', '{"prompt":null}'];
  for (const harness of ["claude", "codex", "antigravity"]) {
    for (const stdin of bad) {
      test(`${harness}: ${JSON.stringify(stdin)} exits 0 with no output`, async () => {
        const r = await run([harness], stdin);
        expect(r.code).toBe(0);
        expect(r.stdout).toBe("");
      });
    }
  }

  test("unknown or missing harness exits 0 with no output", async () => {
    for (const args of [[], ["pi"], ["bogus"]]) {
      const r = await run(args, claudeIn(URL_PROMPT));
      expect(r.code).toBe(0);
      expect(r.stdout).toBe("");
    }
  });
});
