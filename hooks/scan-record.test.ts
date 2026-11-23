import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyCommand, latestRating, readRecord } from "./scan-record";

let tmp: string;
let ghRepo: string; // cwd whose origin is on GitHub
let otherRepo: string; // cwd whose origin is not on GitHub
let noGit: string; // cwd without .git
let recordPath: string;

function gitDir(dir: string, url: string) {
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(
    join(dir, ".git", "config"),
    `[core]\n\trepositoryformatversion = 0\n[remote "upstream"]\n\turl = https://github.com/someone/else.git\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "scan-record-"));
  ghRepo = join(tmp, "gh");
  otherRepo = join(tmp, "other");
  noGit = join(tmp, "nogit");
  mkdirSync(noGit);
  gitDir(ghRepo, "git@github.com:Acme/Widget.git");
  gitDir(otherRepo, "https://gitlab.com/acme/widget.git");
  recordPath = join(tmp, "scanned.txt");
  writeFileSync(
    recordPath,
    [
      "acme/widget\tHIGH\t2026-01-01",
      "acme/clean\tLOW\t2026-01-02",
      "acme/widget\tLOW\t2026-02-03", // newest wins
      "acme/bad\tCRITICAL\t2026-03-04",
      "garbage line",
      "",
    ].join("\n"),
  );
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("readRecord / latestRating", () => {
  test("newest line per repo wins", () => {
    const rec = readRecord(recordPath);
    expect(rec.get("acme/widget")).toEqual({ rating: "LOW", date: "2026-02-03" });
    expect(rec.get("acme/bad")).toEqual({ rating: "CRITICAL", date: "2026-03-04" });
    expect(rec.size).toBe(3);
  });

  test("scanned repo returns its rating, case-insensitive", () => {
    expect(latestRating("Acme/Clean", recordPath)).toBe("LOW");
  });

  test("HIGH-rated repo returns HIGH", () => {
    const p = join(tmp, "high.txt");
    writeFileSync(p, "evil/repo\tHIGH\t2026-05-05\n");
    expect(latestRating("evil/repo", p)).toBe("HIGH");
  });

  test("unscanned repo returns null", () => {
    expect(latestRating("nobody/nothing", recordPath)).toBeNull();
  });

  test("missing record file gives empty map and null", () => {
    const missing = join(tmp, "does-not-exist.txt");
    expect(readRecord(missing).size).toBe(0);
    expect(latestRating("acme/widget", missing)).toBeNull();
  });

  test("default path follows XDG_CACHE_HOME", () => {
    const xdg = join(tmp, "xdg");
    mkdirSync(join(xdg, "security-scan"), { recursive: true });
    writeFileSync(join(xdg, "security-scan", "scanned.txt"), "x/y\tMEDIUM\t2026-06-06\n");
    const old = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = xdg;
    try {
      expect(latestRating("x/y")).toBe("MEDIUM");
    } finally {
      if (old === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = old;
    }
  });
});

describe("classifyCommand (a) clone", () => {
  const clone = (c: string) => classifyCommand(c, noGit);
  test("git clone https", () => {
    expect(clone("git clone https://github.com/Acme/Widget")).toEqual({ ownerRepo: "acme/widget", kind: "clone" });
  });
  test("git clone .git suffix, flags and target dir", () => {
    expect(clone("git clone --depth 1 -b main https://github.com/acme/widget.git /tmp/w")).toEqual({
      ownerRepo: "acme/widget",
      kind: "clone",
    });
  });
  test("git clone ssh scp-style", () => {
    expect(clone("git clone git@github.com:acme/widget.git")).toEqual({ ownerRepo: "acme/widget", kind: "clone" });
  });
  test("gh repo clone owner/repo", () => {
    expect(clone("gh repo clone acme/widget")).toEqual({ ownerRepo: "acme/widget", kind: "clone" });
  });
  test("gh repo clone URL", () => {
    expect(clone("gh repo clone https://github.com/acme/widget")).toEqual({ ownerRepo: "acme/widget", kind: "clone" });
  });
  test("non-GitHub clone is null", () => {
    expect(clone("git clone https://gitlab.com/acme/widget.git")).toBeNull();
  });
});

describe("classifyCommand (b) install from GitHub source", () => {
  const inst = (c: string) => classifyCommand(c, noGit);
  const want = { ownerRepo: "acme/widget", kind: "github-install" };
  test("npm install github:o/r", () => expect(inst("npm install github:acme/widget")).toEqual(want));
  test("npm i github:o/r#ref", () => expect(inst("npm i github:acme/widget#v1")).toEqual(want));
  test("pnpm add git+https URL", () => expect(inst("pnpm add git+https://github.com/acme/widget.git")).toEqual(want));
  test("yarn add https URL", () => expect(inst("yarn add https://github.com/acme/widget")).toEqual(want));
  test("bun add github:", () => expect(inst("bun add github:acme/widget")).toEqual(want));
  test("pip install git+https", () => expect(inst("pip install git+https://github.com/acme/widget.git")).toEqual(want));
  test("uv add git+https", () => expect(inst("uv add git+https://github.com/acme/widget")).toEqual(want));
  test("uv pip install https", () => expect(inst("uv pip install https://github.com/acme/widget")).toEqual(want));
  test("registry package is null", () => {
    expect(inst("npm install lodash")).toBeNull();
    expect(inst("pip install requests")).toBeNull();
  });
});

describe("classifyCommand (c) bare install or build in a GitHub checkout", () => {
  const want = { ownerRepo: "acme/widget", kind: "repo-install" };
  const bare = (c: string, cwd = ghRepo) => classifyCommand(c, cwd);
  for (const c of [
    "npm install",
    "npm i",
    "npm ci",
    "pnpm install",
    "pnpm i",
    "yarn install",
    "bun install",
    "bun i",
    "pip install -r requirements.txt",
    "pip install -e .",
    "uv sync",
    "cargo build",
    "cargo run",
    "make",
    "go build ./...",
  ]) {
    test(c, () => expect(bare(c)).toEqual(want));
  }
  test("flags only are still bare", () => expect(bare("npm install --legacy-peer-deps")).toEqual(want));
  test("named package is not bare", () => expect(bare("npm install lodash")).toBeNull());
  test("plain pip install pkg is not bare", () => expect(bare("pip install requests")).toBeNull());
  test("unrelated command is null", () => expect(bare("ls -la")).toBeNull());
  test("origin not on GitHub is null", () => expect(bare("npm install", otherRepo)).toBeNull());
  test("no .git is null", () => expect(bare("npm install", noGit)).toBeNull());
  test("env prefix is ignored", () => expect(bare("CI=1 npm ci")).toEqual(want));
  test("later segment of a compound command", () => expect(bare("echo hi && npm install")).toEqual(want));
});

describe("classifyCommand with cd", () => {
  test("cd then bare install is out of scope", () => {
    expect(classifyCommand("cd /somewhere && npm install", ghRepo)).toBeNull();
    expect(classifyCommand("cd sub; make", ghRepo)).toBeNull();
  });
  test("clone before cd still counts", () => {
    expect(classifyCommand("git clone https://github.com/acme/widget && cd widget && npm install", noGit)).toEqual({
      ownerRepo: "acme/widget",
      kind: "clone",
    });
  });
  test("cd then clone still names its repo", () => {
    expect(classifyCommand("cd /tmp && git clone https://github.com/acme/widget", noGit)).toEqual({
      ownerRepo: "acme/widget",
      kind: "clone",
    });
  });
});
