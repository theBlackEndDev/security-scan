/**
 * Pure logic shared by every harness adapter (hooks/url-hint.ts, the pi extension).
 * No I/O here.
 */

export type Harness = "claude" | "codex" | "antigravity" | "pi";

const REPO_RE =
  /(?<![\w.@-])(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/([\w.-]+)/i;

// The prompt already runs the skill: `/security-scan`, `$security-scan`,
// `/skill:security-scan`, `/security-scan:security-scan`. Anchored to the start of the
// text or whitespace, so the repo URL `github.com/o/security-scan` does not count.
const INVOKED_RE = /(?:^|\s)[/$](?:skill:)?(?:security-scan:)?security-scan(?![\w-])/i;

/** First GitHub repo in `text`, as `https://github.com/owner/repo`. Null if none, or if the skill is already invoked. */
export function findGitHubRepo(text: string): string | null {
  if (typeof text !== "string" || INVOKED_RE.test(text)) return null;
  const m = REPO_RE.exec(text);
  if (!m) return null;
  const repo = m[2].replace(/\.git$/i, "").replace(/\.+$/, "");
  if (!repo) return null;
  return `https://github.com/${m[1]}/${repo}`;
}

// Invocation per harness. Claude plugin skills are namespaced `plugin:skill`.
// shortcut: Plans/research/harness-packaging.md was never written (task 1.2 blocked), so
// these come from each harness's skill docs, not that file. Claude and pi are documented.
// Codex `$name` and the agy wording are unverified; recheck them in task 6.6.
const INVOCATION: Record<Harness, (url: string) => string> = {
  claude: (url) => `/security-scan:security-scan ${url}`,
  codex: (url) => `$security-scan ${url}`,
  antigravity: (url) => `use the security-scan skill on ${url}`,
  pi: (url) => `/skill:security-scan ${url}`,
};

/** Advisory text telling the model (and user) to scan `url` before cloning or running it. */
export function suggestion(url: string, harness: Harness): string {
  const run = INVOCATION[harness] ?? INVOCATION.claude;
  return `GitHub repository detected: ${url}. Run ${run(url)} to scan it for security issues before cloning, installing or running it.`;
}
