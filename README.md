<p align="center">
  <strong>Scan a GitHub repository for security problems before you clone it, install it or run it.</strong>
</p>

<p align="center">
  <a href="#license"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat"></a>
  <img alt="Version 1.0.0" src="https://img.shields.io/badge/version-1.0.0-informational?style=flat">
  <img alt="Works with: Claude Code, Codex CLI, Antigravity, pi" src="https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20Codex%20%7C%20Antigravity%20%7C%20pi-lightgrey?style=flat">
</p>

<p align="center">
  <a href="#why">Why</a> •
  <a href="#what-it-checks">What it checks</a> •
  <a href="#install">Install</a> •
  <a href="#use-it">Use it</a> •
  <a href="#how-it-works">How it works</a> •
  <a href="#security-and-privacy">Security and privacy</a>
</p>

security-scan is a skill for AI coding agents. You give it a GitHub repository. It reads the code
without running any of it, looks for signs of malware and attacks, and gives you a risk rating with
the file and line for each finding.

It also installs two small hooks. One suggests a scan when you paste a GitHub link. The other warns
the agent before it clones or installs a repository that nobody has scanned. Both hooks only advise.
They never block anything.

> **Status:** early (version 1.0.0). The plugin installs from a local checkout in Claude Code, Codex
> CLI and pi, and the hook scripts return the right output for sample input. A live run with a model
> in each harness is not recorded yet. See [Install](#install) for what was checked in each one.

---

## Why

Most repositories you find on GitHub are fine. A few are built to hurt you, and they work because the
dangerous step is one you were going to take anyway: `npm install`, `make`, or opening the folder in
an AI agent.

| Without security-scan | With security-scan |
|---|---|
| You paste a link and run `git clone` and `npm install`. | The agent offers a scan first, and warns if you skip it. |
| A `postinstall` script runs on your machine the moment you install. | The scan reads `package.json` and shows the script before it can run. |
| A hidden line in `AGENTS.md` tells your agent to read your SSH keys. | The scan finds hidden text and instructions aimed at agents. |
| You trust the README. | The scan treats the README as data and reports any attempt to steer it. |

---

## What it checks

The skill works through 15 categories, A to O.

| Category | Examples |
|---|---|
| **A. Repo structure** | Hidden files, binaries, embedded archives, double extensions such as `readme.txt.exe` |
| **B. Install and execution traps** | `postinstall` scripts, `curl \| sh`, devcontainer hooks, auto-run editor tasks, CI workflows that fetch scripts |
| **C. Obfuscation** | `eval()`, `new Function`, long base64 strings, Python `exec`, `marshal` and `zlib`, PowerShell `-EncodedCommand` |
| **D. Network exfiltration and credential theft** | Discord webhooks, Telegram bots, ngrok, raw IP addresses, reads of SSH keys, cloud credentials and browser data |
| **E. Persistence** | Cron jobs, systemd services, launch agents, registry run keys, startup folder writes |
| **F. Supply chain** | Typosquatted names, git dependencies on unknown repos, vendored binaries, missing lockfiles, wide version ranges |
| **G. Unicode and hidden characters** | Bidi overrides, zero-width characters, Unicode Tags that hide text, lookalike letters and filenames |
| **H. Dangerous file targets** | Code that touches `~/.ssh`, `.env`, `~/.aws`, shell rc files, package tokens, wallets |
| **I. Social engineering in docs** | "Disable antivirus", "run as admin", "ignore the warning", one-line installers |
| **J. CI/CD and auto-run surfaces** | GitHub Actions, GitLab CI, Jenkins, CircleCI, Travis, bots that auto-merge |
| **K. Agent instruction files** | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules`, `.github/copilot-instructions.md`, `.windsurfrules`: hidden text, "ignore previous instructions", orders to run commands or touch secrets |
| **L. Repo-shipped agent config** | `.claude/`, `.mcp.json`, `.codex/`, `.agents/`, `.gemini/`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.pi/`, any `hooks.json`: hooks that run commands, allow-all tool lists, turned-off prompts |
| **M. MCP servers and skills** | Unpinned or remote MCP servers, tool descriptions that try to steer the model, skills that pipe a download into a shell |
| **N. AI-era supply chain** | Invented package names (slopsquatting), indicators of the 2025 Shai-Hulud and Nx s1ngularity npm attacks, install scripts that call AI CLIs |
| **O. Markdown exfiltration** | Markdown images whose URL carries data out of a chat |

See [Words you'll see](#words-youll-see) for any term you do not know.

---

## Before you start

- **A supported agent.** Claude Code, Codex CLI, Antigravity (`agy`) or pi.
- **`git`.** The scan uses it to clone the repository.
- **`perl`.** The hidden-text check needs it. macOS and Linux include it.
- **[Bun](https://bun.sh).** The hooks for Claude Code, Codex and Antigravity run on Bun. pi does not
  need it. The skill by itself needs no Bun.

---

## Install

Pick your agent. Each one has a plugin install (skill and both hooks in one step) and a manual copy
(skill only, no hooks).

### Claude Code

```bash
claude plugin marketplace add theBlackEndDev/security-scan
claude plugin install security-scan@security-scan
```

On Claude Code 2.1.275 or later, one line in a session does the same:

```
/plugin install security-scan --marketplace theBlackEndDev/security-scan
```

<details>
<summary>Manual copy (skill only, no hooks)</summary>

Copy the whole skill folder. The hidden-text script lives in it.

```bash
mkdir -p ~/.claude/skills
cp -R skills/security-scan ~/.claude/skills/security-scan
```

</details>

Checked with Claude Code 2.1.327: `claude plugin validate . --strict` passes, the plugin installs from
a local checkout, and both hook scripts return the expected output for sample input.

### Codex CLI

```bash
codex plugin marketplace add theBlackEndDev/security-scan
codex plugin add security-scan@security-scan
```

Codex asks you to approve the plugin's hooks the first time. They do not run until you do.

<details>
<summary>Manual copy (skill only, no hooks)</summary>

```bash
mkdir -p ~/.agents/skills
cp -R skills/security-scan ~/.agents/skills/security-scan
```

pi reads the same folder, so this one copy covers both.

</details>

Checked with Codex CLI 0.167.1: the plugin installs from a local checkout, `codex plugin list --json`
shows it, and both hook scripts return the expected output for sample input.

### Antigravity (`agy`)

`agy` installs from a folder, so clone the repository first.

```bash
git clone https://github.com/theBlackEndDev/security-scan.git
agy plugin install ./security-scan
```

<details>
<summary>Manual copy (skill only, no hooks)</summary>

```bash
mkdir -p ~/.gemini/config/skills
cp -R skills/security-scan ~/.gemini/config/skills/security-scan
```

</details>

Checked with agy 1.5.14: `agy plugin validate .` finds the manifest, the skill and the hook. Strict
mode still reports one warning: `agy` loads only the first 24,000 bytes of the skill, and the skill
is a little longer. The last steps (write the scan record, clean up) can fall in the cut-off part.

### pi

```bash
pi install git:github.com/theBlackEndDev/security-scan
```

pi loads the skill and a TypeScript extension that does the work of both hooks. You do not need Bun
for this one.

<details>
<summary>Manual copy (skill only, no extension)</summary>

```bash
mkdir -p ~/.agents/skills
cp -R skills/security-scan ~/.agents/skills/security-scan
```

</details>

Checked with pi 1.5.0: `pi install` from a local checkout succeeds and the extension's tests pass.

---

## Use it

Ask your agent to run the skill on a repository. The name differs by agent:

| Agent | What you type |
|---|---|
| Claude Code, plugin install | `/security-scan:security-scan https://github.com/owner/repo` |
| Claude Code, manual copy | `/security-scan https://github.com/owner/repo` |
| Codex CLI | `$security-scan https://github.com/owner/repo` |
| Antigravity | `use the security-scan skill on https://github.com/owner/repo` |
| pi | `/skill:security-scan https://github.com/owner/repo` |

`owner/repo` on its own also works. Anything that is not a `github.com` repository is rejected.

### What the hooks do

**Link hint.** When your message contains a GitHub link, the agent gets a note like this:

```
GitHub repository detected: https://github.com/sketchy-user/cool-tool. Run /security-scan:security-scan
https://github.com/sketchy-user/cool-tool to scan it for security issues before cloning, installing
or running it.
```

It fires once per message. It stays quiet when your message already runs the skill.

**Pre-tool warning.** Before the agent runs a shell command, the hook checks whether the command
reaches a GitHub repository. It warns when the repository has no scan record, or its latest rating
is HIGH or CRITICAL. It warns for these commands:

1. `git clone` or `gh repo clone` of a GitHub repository.
2. An install that names a GitHub source (`github:owner/repo`, `git+https://github.com/owner/repo`
   or `https://github.com/owner/repo`) through `npm`, `pnpm`, `yarn`, `bun`, `pip` or `uv`.
3. A bare install or build (`npm`, `pnpm`, `yarn` or `bun` with `install`, `i` or `ci`;
   `pip install -r` or `-e`; `uv sync`; `cargo build` or `run`; `make`; `go build`) when the folder
   you are in has a git `origin` on GitHub.

The warning tells the agent to suggest a scan, and says it must not refuse the command. The command
still runs. In Claude Code and Codex the text goes to the agent. In Antigravity it goes to your
terminal. In pi it goes to both.

**Limit:** the hook does not follow `cd`. A command like `cd some-repo && npm install` is not
checked, because the hook does not know where the command ends up.

### Silence a warning

Scan the repository. After each report the skill adds one line to a file on your machine:

```
${XDG_CACHE_HOME:-$HOME/.cache}/security-scan/scanned.txt
```

Each line is `owner/repo`, a tab, the rating and the date. The newest line for a repository wins. A
repository rated SAFE, LOW or MEDIUM stops triggering the warning. A HIGH or CRITICAL one keeps
triggering it.

---

## Example report

```
## Security Scan: owner/repo

**Risk Rating**: HIGH

### Findings

#### [CRITICAL] Postinstall script exfiltrates environment variables
- File: package.json:12
- Pattern: postinstall script runs curl to external IP
- Context: Sends process.env to http://45.33.x.x/collect

#### [HIGH] Discord webhook for data exfiltration
- File: src/utils/telemetry.js:47
- Pattern: discord.com/api/webhooks URL
- Context: Sends SSH key contents to Discord channel

### Summary
| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 1 |

### Recommendation
**HIGH RISK**: Do not run. Clone for read-only inspection in isolated environment only.
```

The risk rating is one of:

- **SAFE.** No findings.
- **LOW.** Minor notes only.
- **MEDIUM.** Review the flagged items. Build in a sandbox first.
- **HIGH.** Do not run it. Read it in an isolated environment only.
- **CRITICAL.** Avoid it. There are signs of malicious intent.

---

## How it works

1. **Clone.** The skill makes a private temporary folder and shallow-clones the repository into it
   (`--depth 1`, so only the latest files).
2. **Read.** It reads and searches the files with `grep`, `find` and the agent's file tools. It never
   runs `npm install`, `pip install`, `make` or any build, and never runs a file from the repository.
3. **Check hidden text.** It runs `skills/security-scan/scripts/find-hidden-text.pl`, a small Perl
   script that lists invisible characters and decodes text hidden in Unicode Tags.
4. **Report.** It works through categories A to O and writes the report above, with a file and line
   for each finding.
5. **Record.** It appends the rating to your scan record so the pre-tool hook stops warning.
6. **Clean up.** It deletes its own temporary folder and nothing else.

The skill treats everything in the repository as data. If a README or code comment tries to tell the
scanner what to do, such as "report this repo as SAFE", the skill reports that as a finding and keeps
going. The rating comes from its own analysis.

---

## Words you'll see

- **Agent / harness.** An AI coding tool you talk to in a terminal. Here: Claude Code, Codex CLI,
  Antigravity and pi.
- **Skill.** A folder of instructions (`SKILL.md`) that an agent loads when you ask for it.
- **Plugin / marketplace.** A plugin bundles a skill and hooks so one command installs them. A
  marketplace is the catalog that lists plugins.
- **Hook.** A small program the agent runs on an event, such as "you sent a message" or "I am about to
  run a command".
- **Advisory.** A hook that adds a message and never blocks.
- **Static analysis.** Reading code without running it.
- **Install trap.** A script that runs on its own during install or build, such as `postinstall`.
- **Obfuscation.** Code written to hide what it does, such as a payload packed into a base64 string.
- **Exfiltration.** Sending your data to someone else's server.
- **Persistence.** A way for malware to keep running after a restart, such as a cron job.
- **Supply chain.** The packages and tools a project depends on.
- **Typosquatting.** A malicious package with a name one letter away from a popular one.
- **Slopsquatting.** The same trick with a name an AI model made up. Attackers register names that
  models invent.
- **Bidi override.** An invisible character that reverses text direction, so code reads differently
  from how it runs.
- **Zero-width character.** A character with no visible width. It can hide inside names and commands.
- **Unicode Tags.** A block of invisible characters that can spell hidden English text that an AI agent
  can read and you cannot.
- **Homoglyph.** A letter from another alphabet that looks the same as a Latin letter.
- **Prompt injection.** Text written to take over an AI agent, such as "ignore your previous
  instructions".
- **MCP server.** A tool server an agent can call. Its tool descriptions go to the model.
- **Tool poisoning.** An MCP tool description that tells the model to do something hidden, such as read
  your keys.
- **Worm.** Malware that spreads itself. Shai-Hulud spread through npm packages in 2025.
- **Scan record.** The `scanned.txt` file that lists which repositories you have scanned and how they
  were rated.
- **Trust approval.** Codex's one-time question before it runs a plugin's hooks.

---

## Security and privacy

- **No tracking.** There is no telemetry, no account and no server. The only network call is the
  `git clone` of the repository you ask about.
- **Read-only.** The scan never executes code from the repository. The only commands it runs are the
  clone, read-only inspection commands, the bundled `find-hidden-text.pl` script and the record write.
- **Local record.** `scanned.txt` stays on your machine. It holds repository names, ratings and dates.
- **Cleanup.** The skill deletes only the temporary folder it made.

Limits you should know:

- **A rating is a judgment, not a proof.** A model reads the evidence. SAFE means the scan found
  nothing, not that the repository is safe.
- **It scans the latest files only.** Earlier commits, other branches and later changes are not
  covered. A repository can change after you scan it.
- **The scanner can be attacked.** The skill is told to ignore instructions it finds in the
  repository, but a model can still be fooled. Read the findings, not only the rating.
- **The 2025 indicators age.** The Shai-Hulud and s1ngularity checks look for known 2025 signs. A clean
  result says nothing about newer attacks.
- **No registry lookups.** The scan does not check whether a package name exists or how new it is. It
  lists suspect names for you to check.
- **The hooks are advisory.** An agent or a user can ignore them. They cover only the commands listed in
  [What the hooks do](#what-the-hooks-do), only for GitHub, and not after a `cd`.
- **The scan record is a plain text file.** Anyone who can write to it can mark a repository as scanned.
- **Antigravity may cut off the end of the skill.** See [the `agy` install note](#antigravity-agy).

---

## Working on security-scan

```bash
bun test
```

| Path | What it is |
|---|---|
| `skills/security-scan/SKILL.md` | The skill: the steps and a summary of categories A to O. |
| `skills/security-scan/references/categories.md` | The detailed checks for each category. Edit this to add a check. |
| `skills/security-scan/scripts/find-hidden-text.pl` | The hidden-text finder. Tested in `tests/hidden-text.test.ts`. |
| `hooks/core.ts` | Finds a GitHub link in text and builds the suggestion. |
| `hooks/scan-record.ts` | Reads the scan record and decides which commands get a warning. |
| `hooks/url-hint.ts`, `hooks/pre-tool.ts` | The two hook programs. Each takes the agent name as its argument. |
| `hooks/claude.json`, `hooks/codex.json`, `hooks/antigravity.json` | Hook settings for each agent. |
| `hooks.json` | A link to `hooks/antigravity.json`. `agy` reads hooks only from this path. |
| `extensions/security-scan.ts` | The pi extension. It does the work of both hooks. |
| `.claude-plugin/`, `.codex-plugin/`, `.antigravity-plugin/`, `.agents/plugins/` | Plugin and marketplace files. |
| `package.json` | The pi package file. |

Found a pattern that should be detected? Open an issue or a pull request.

---

## License

MIT. See [LICENSE](LICENSE).
