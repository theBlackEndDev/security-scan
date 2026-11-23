/**
 * scan-record.ts
 *
 * Scan record (D13) reader and shell-command classifier (D14).
 * Pure logic, no output. Used by hooks/pre-tool.ts and the pi extension.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Rating = string;
export interface RecordEntry {
  rating: Rating;
  date: string;
}
export type CommandKind = "clone" | "github-install" | "repo-install";
export interface Classification {
  ownerRepo: string;
  kind: CommandKind;
}

/** `${XDG_CACHE_HOME:-$HOME/.cache}/security-scan/scanned.txt`, resolved at call time. */
export function defaultRecordPath(): string {
  const base =
    process.env.XDG_CACHE_HOME || join(process.env.HOME ?? "", ".cache");
  return join(base, "security-scan", "scanned.txt");
}

/**
 * Parse the scan record. Lines are `owner/repo<TAB>RATING<TAB>YYYY-MM-DD`.
 * The newest (last) line for a repo wins. A missing or unreadable file
 * gives an empty map.
 */
export function readRecord(path: string = defaultRecordPath()): Map<string, RecordEntry> {
  const out = new Map<string, RecordEntry>();
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const [repo, rating, date] = line.split("\t");
    if (!repo || !rating) continue;
    out.set(repo.trim().toLowerCase(), {
      rating: rating.trim().toUpperCase(),
      date: (date ?? "").trim(),
    });
  }
  return out;
}

/** Latest rating for `owner/repo` (case-insensitive), or null when never scanned. */
export function latestRating(ownerRepo: string, path?: string): Rating | null {
  return readRecord(path).get(ownerRepo.toLowerCase())?.rating ?? null;
}

// ---------------------------------------------------------------------------
// Command classification (D14)
// ---------------------------------------------------------------------------

const REPO = "[\\w.-]+/[\\w.-]+?";
// Matches the GitHub forms: https/ssh/git+ URLs, scp-style git@github.com:o/r, github:o/r
const GITHUB_REF_RES = [
  new RegExp(`^(?:git\\+)?(?:https?|ssh|git)://(?:[^@/\\s]+@)?(?:www\\.)?github\\.com[/:](${REPO})(?:\\.git)?(?:[#/?].*)?$`, "i"),
  new RegExp(`^(?:[\\w.-]+@)?github\\.com:(${REPO})(?:\\.git)?(?:[#?].*)?$`, "i"),
  new RegExp(`^github:(${REPO})(?:[#?].*)?$`, "i"),
  new RegExp(`^github\\.com/(${REPO})(?:\\.git)?(?:[#/?].*)?$`, "i"),
];

function githubOwnerRepo(token: string): string | null {
  for (const re of GITHUB_REF_RES) {
    const m = re.exec(token);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function tokenize(segment: string): string[] {
  const tokens = segment
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);
  // Drop leading VAR=value assignments.
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  return tokens;
}

/** Owner/repo of the `origin` remote in `<cwd>/.git/config`, if it is on GitHub. */
function originOwnerRepo(cwd: string): string | null {
  let text: string;
  try {
    text = readFileSync(join(cwd, ".git", "config"), "utf-8");
  } catch {
    return null;
  }
  let inOrigin = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(line);
      continue;
    }
    if (!inOrigin) continue;
    const m = /^url\s*=\s*(.+)$/.exec(line);
    if (m) return githubOwnerRepo(m[1].trim());
  }
  return null;
}

const NPM_FAMILY = new Set(["npm", "pnpm", "yarn", "bun"]);
const NPM_INSTALL_VERBS = new Set(["install", "i", "add", "ci"]);
const NPM_BARE_VERBS = new Set(["install", "i", "ci"]);

function classifyClone(tokens: string[]): Classification | null {
  const [prog, a, b] = tokens;
  const isGit = prog === "git" && a === "clone";
  const isGh = prog === "gh" && a === "repo" && b === "clone";
  if (!isGit && !isGh) return null;
  for (const t of tokens.slice(isGit ? 2 : 3)) {
    let ownerRepo = githubOwnerRepo(t);
    if (!ownerRepo && isGh && new RegExp(`^${REPO}$`).test(t)) ownerRepo = t.replace(/\.git$/, "").toLowerCase();
    if (ownerRepo) return { ownerRepo, kind: "clone" };
  }
  return null;
}

function isInstallInvocation(tokens: string[]): boolean {
  const [prog, a, b] = tokens;
  if (NPM_FAMILY.has(prog)) return NPM_INSTALL_VERBS.has(a);
  if (prog === "pip" || prog === "pip3") return a === "install";
  if (prog === "uv") return a === "add" || (a === "pip" && b === "install") || (a === "tool" && b === "install");
  return false;
}

function classifyGithubInstall(tokens: string[]): Classification | null {
  if (!isInstallInvocation(tokens)) return null;
  for (const t of tokens.slice(2)) {
    const ownerRepo = githubOwnerRepo(t);
    if (ownerRepo) return { ownerRepo, kind: "github-install" };
  }
  return null;
}

/** Install or build of the repo in cwd, with no package arguments. */
function isRepoInstallOrBuild(tokens: string[]): boolean {
  const [prog, a] = tokens;
  const rest = tokens.slice(2);
  if (NPM_FAMILY.has(prog)) return NPM_BARE_VERBS.has(a) && rest.every((t) => t.startsWith("-"));
  if (prog === "pip" || prog === "pip3") {
    return a === "install" && rest.some((t) => t === "-r" || t === "-e" || t.startsWith("--requirement") || t.startsWith("--editable"));
  }
  if (prog === "uv") return a === "sync";
  if (prog === "cargo") return a === "build" || a === "run";
  if (prog === "go") return a === "build";
  return prog === "make";
}

/**
 * Classify a shell command per D14. Returns the GitHub repo it touches and why,
 * or null when it is none of the D14 forms. Rating checks are the caller's job.
 *
 * The command is split on `&&`, `||`, `;`, `|` and newlines. Clone and
 * GitHub-source installs name their repo, so they count anywhere. A bare
 * install or build relies on `cwd`, so it is ignored once an earlier segment
 * ran `cd` (out of scope per D14).
 */
export function classifyCommand(command: string, cwd: string): Classification | null {
  let cwdKnown = true;
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const tokens = tokenize(segment);
    if (!tokens.length) continue;
    if (tokens[0] === "cd" || tokens[0] === "pushd") {
      cwdKnown = false;
      continue;
    }
    const hit = classifyClone(tokens) ?? classifyGithubInstall(tokens);
    if (hit) return hit;
    if (cwdKnown && cwd && isRepoInstallOrBuild(tokens)) {
      const ownerRepo = originOwnerRepo(cwd);
      if (ownerRepo) return { ownerRepo, kind: "repo-install" };
    }
  }
  return null;
}
