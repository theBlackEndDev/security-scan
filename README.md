# security-scan

**A Claude Code skill that scans GitHub repositories for security threats before you clone or run them.**

Stop blindly `npm install`-ing random repos. This skill performs a 10-category static analysis — install traps, obfuscation, credential theft, supply-chain attacks, Unicode abuse, persistence mechanisms, and social engineering — all without executing a single line of the target repo's code.

## Quick Install

```bash
# Clone this repo
git clone https://github.com/theBlackEndDev/security-scan.git
cd security-scan

# Install the skill (user-global)
mkdir -p ~/.claude/skills/security-scan
cp skills/security-scan/SKILL.md ~/.claude/skills/security-scan/SKILL.md

# Done. Now use: /security-scan https://github.com/owner/repo
```

## What It Catches

| Category | Examples |
|----------|---------|
| **Install traps** | `postinstall` scripts, `curl\|sh`, devcontainer hooks, CI workflows fetching remote scripts |
| **Obfuscation** | `eval()`, base64 blobs, minified JS in wrong places, Python `exec`/`marshal`/`zlib` |
| **Network exfil** | Discord webhooks, Telegram bots, ngrok, raw IP requests, credential file reads |
| **Credential theft** | SSH keys, AWS creds, browser cookies, crypto wallets, `.env` files, package auth tokens |
| **Persistence** | Cron jobs, systemd services, launch agents, registry edits, startup folder writes |
| **Supply-chain** | Typosquatted deps, git deps to random repos, vendored binaries, missing checksums |
| **Unicode abuse** | Bidi override chars, zero-width chars, homoglyphs, lookalike filenames |
| **Social engineering** | "Disable antivirus", "run as admin", "ignore the warning", suspicious one-liners |

## Installation

### 1. Install the Skill

Copy the skill directory into your Claude Code skills folder:

```bash
# User-global (available in all projects)
mkdir -p ~/.claude/skills/security-scan
cp skills/security-scan/SKILL.md ~/.claude/skills/security-scan/SKILL.md
```

Or for a specific project:

```bash
mkdir -p .claude/skills/security-scan
cp skills/security-scan/SKILL.md .claude/skills/security-scan/SKILL.md
```

### 2. Install the Hook (Optional)

The hook auto-detects GitHub URLs in your prompts and suggests running the scan.

```bash
cp hooks/GitHubUrlDetector.hook.ts ~/.claude/hooks/
chmod +x ~/.claude/hooks/GitHubUrlDetector.hook.ts
```

Then add to your `~/.claude/settings.json` under `hooks.UserPromptSubmit`:

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "bun run ~/.claude/hooks/GitHubUrlDetector.hook.ts",
      "timeout": 2000
    }
  ]
}
```

**Requires [Bun](https://bun.sh) for the hook.** The skill itself has no dependencies.

## Usage

### Manual scan

```
/security-scan https://github.com/owner/repo
```

### With the hook installed

Just paste a GitHub URL in your prompt — the hook will suggest running a scan:

```
> Check out https://github.com/sketchy-user/cool-tool

[Hook]: GitHub repository detected. Run /security-scan https://github.com/sketchy-user/cool-tool
        to scan for security issues before cloning or running.
```

## Output

The scan produces a structured report:

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

## How It Works

1. **Shallow clones** the repo to `/tmp/security-scan-*` (never on your main filesystem)
2. **Reads files only** — never runs `npm install`, `pip install`, `make`, or any build command
3. **Scans 10 categories** using grep patterns, file analysis, and contextual judgment
4. **Produces a risk rating** with exact file:line references
5. **Cleans up** the temp directory when done

## Safety

- The scanner never executes any code from the target repository
- Analysis is purely static — file reads, grep, and glob only
- Temporary clone is always cleaned up
- The hook is non-blocking — it suggests, never forces

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [Bun](https://bun.sh) (for the hook only; the skill has no dependencies)
- `git` (for cloning)

## Contributing

Found a pattern that should be detected? Open an issue or PR. The scan categories live in `skills/security-scan/SKILL.md` — it's just markdown, so contributions are easy.

## License

MIT — see [LICENSE](LICENSE)
