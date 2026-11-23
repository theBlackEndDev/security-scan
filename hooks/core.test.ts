import { describe, expect, test } from "bun:test";
import { findGitHubRepo, suggestion } from "./core";

const URL = "https://github.com/octocat/Hello-World";

describe("findGitHubRepo", () => {
  test.each([
    ["github.com/octocat/Hello-World", URL],
    ["https://github.com/octocat/Hello-World", URL],
    ["http://github.com/octocat/Hello-World", URL],
    ["https://github.com/octocat/Hello-World.git", URL],
    ["github.com/octocat/Hello-World.git", URL],
    ["https://www.github.com/octocat/Hello-World", URL],
    ["https://github.com/octocat/Hello-World/blob/main/README.md", URL],
    ["https://github.com/octocat/Hello-World?tab=readme", URL],
    ["please look at https://github.com/octocat/Hello-World.", URL],
    ["(https://github.com/octocat/Hello-World)", URL],
    ["clone GitHub.com/octocat/Hello-World now", URL],
    ["https://github.com/a/b and https://github.com/c/d", "https://github.com/a/b"],
    ["https://github.com/a/my.repo.git", "https://github.com/a/my.repo"],
  ])("%s", (text, expected) => {
    expect(findGitHubRepo(text)).toBe(expected);
  });

  test.each([
    "",
    "no link here",
    "https://gitlab.com/octocat/Hello-World",
    "https://notgithub.com/octocat/Hello-World",
    "https://github.com/octocat",
    "git@github.com:octocat/Hello-World.git",
  ])("null for %j", (text) => {
    expect(findGitHubRepo(text)).toBeNull();
  });

  test.each([
    `/security-scan ${URL}`,
    `/security-scan:security-scan ${URL}`,
    `$security-scan ${URL}`,
    `/skill:security-scan ${URL}`,
    `please run\n/security-scan ${URL}`,
  ])("null when already invoked: %j", (text) => {
    expect(findGitHubRepo(text)).toBeNull();
  });

  test("a repo that is itself named security-scan is still found", () => {
    expect(findGitHubRepo("https://github.com/theBlackEndDev/security-scan")).toBe(
      "https://github.com/theBlackEndDev/security-scan",
    );
  });

  test("non-string input", () => {
    expect(findGitHubRepo(undefined as unknown as string)).toBeNull();
  });
});

describe("suggestion", () => {
  test.each([
    ["claude", `/security-scan:security-scan ${URL}`],
    ["codex", `$security-scan ${URL}`],
    ["antigravity", `security-scan skill on ${URL}`],
    ["pi", `/skill:security-scan ${URL}`],
  ] as const)("%s", (harness, invocation) => {
    const s = suggestion(URL, harness);
    expect(s).toContain(URL);
    expect(s).toContain(invocation);
  });
});
