---
name: security-scan
description: Clone and scan a GitHub repository for security issues including install traps, obfuscation, credential theft, supply-chain attacks, Unicode abuse, and social engineering. Use when a user shares a GitHub URL to evaluate before cloning or running.
---

# security-scan

Perform a comprehensive security audit of a GitHub repository. The target is provided as `$ARGUMENTS` — either a full GitHub URL or `owner/repo` shorthand.

## Step 1: Validate and Clone

1. Parse `$ARGUMENTS` into a GitHub clone URL. Accept:
   - `https://github.com/owner/repo`
   - `https://github.com/owner/repo.git`
   - `owner/repo` (expand to `https://github.com/owner/repo.git`)
2. Reject anything that doesn't resolve to `github.com/<owner>/<repo>`.
3. Clone shallow: `git clone --depth 1 <url> /tmp/security-scan-$(date +%s)`
4. If the clone exceeds 500MB, abort with: "Repository too large for automated scan."

## Step 2: Safety Rules

**These are absolute and non-negotiable:**
- NEVER run `npm install`, `pip install`, `cargo build`, `make`, `go build`, or ANY build/install command
- NEVER execute, source, or run any file from the repo
- NEVER run binaries found in the repo
- This is READ-ONLY analysis — use only `Read`, `Grep`, `Glob`, `Bash(ls/file/wc/xxd/stat)` tools
- Clean up the temp directory when done, regardless of outcome

## Step 3: Scan (All 10 Categories)

Work through every category below. For each, use the specified grep patterns and file globs. Report findings immediately as you discover them.

### A. Repo Structure Survey

Examine the overall layout:
- `ls -laR` for hidden files/directories
- Look for binary files: `find /tmp/security-scan-* -type f \( -name "*.exe" -o -name "*.dll" -o -name "*.so" -o -name "*.dylib" -o -name "*.bin" -o -name "*.dat" \)`
- Check for embedded archives: `.tar`, `.gz`, `.zip`, `.7z` in source directories
- Large files (>1MB) in non-expected locations
- Files with double extensions (e.g., `readme.txt.exe`)

### B. Install / Execution Traps

Check these files for auto-execution hooks:

| File | What to look for |
|------|-----------------|
| `package.json` | `preinstall`, `postinstall`, `prepare`, `prestart`, `prepublish` in `scripts` |
| `setup.py`, `setup.cfg`, `pyproject.toml` | `cmdclass` overrides, custom `install`/`develop` commands, `[tool.setuptools.cmdclass]` |
| `Makefile`, `justfile` | Targets that `curl\|sh`, `wget\|bash`, or download+execute |
| `.devcontainer/devcontainer.json` | `postCreateCommand`, `postStartCommand`, `postAttachCommand` |
| `Dockerfile`, `docker-compose.yml` | `RUN curl\|sh`, `RUN wget\|bash`, suspicious `ADD` from URLs |
| `.vscode/tasks.json` | `runOn: folderOpen`, auto-run tasks |
| `.vscode/settings.json` | `terminal.integrated.shellArgs`, code execution settings |
| `.githooks/*`, `.husky/*` | Any hook installers or hook scripts with network calls |
| `.github/workflows/*.yml` | `curl\|sh`, `wget\|bash`, `actions/checkout` + remote script execution |
| `Cargo.toml` + `build.rs` | Network calls in build scripts |
| `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml` | Remote script downloads |

Grep patterns:
```
preinstall|postinstall|prepare|prestart
curl.*\|.*sh|wget.*\|.*bash
cmdclass|custom_install
postCreateCommand|postStartCommand
runOn.*folderOpen
```

### C. Obfuscation Detection

Search for intent-hiding patterns:

**JavaScript/TypeScript:**
- `eval(` — dynamic code execution
- `new Function(` or `Function(` — dynamic function creation
- `atob(` with long base64 strings
- `Buffer.from(` with base64 encoding
- Minified JS files in non-`dist`/non-`node_modules`/non-`vendor` directories
- `require` or `import` from remote HTTP URLs

**Python:**
- `exec(`, `compile(`, `eval(`
- `marshal.loads`, `pickle.loads`
- `zlib.decompress`, `codecs.decode`
- `__import__(` with string construction
- `importlib.import_module` with dynamic strings

**PowerShell:**
- `-EncodedCommand`, `-e` followed by base64
- `Invoke-Expression`, `iex`
- `[System.Convert]::FromBase64String`

**General:**
- Base64 strings longer than 100 characters in source files
- String concatenation assembling URLs or domain names across multiple variables
- Hex-encoded strings being decoded at runtime

Grep patterns:
```
eval\(|new Function\(|Function\(
atob\(|Buffer\.from\(
exec\(|compile\(|marshal\.loads|pickle\.loads
zlib\.decompress|codecs\.decode
__import__\(|importlib\.import_module
-EncodedCommand|Invoke-Expression|iex
[A-Za-z0-9+/=]{100,}
```

### D. Network Exfiltration / Credential Theft

Search for phone-home patterns:

**Suspicious destinations:**
- Raw IP addresses in URLs: `http://\d+\.\d+\.\d+\.\d+`
- Discord webhooks: `discord.com/api/webhooks`
- Telegram bots: `api.telegram.org/bot`
- Pastebin: `pastebin.com`
- ngrok: `ngrok.io`, `ngrok-free.app`
- Requestbin/webhook.site/pipedream
- Any `*.requestbin.com`, `*.webhook.site`, `*.pipedream.net`

**Credential access:**
- Reading `~/.ssh`, `$HOME/.ssh`, `%USERPROFILE%\.ssh`
- Reading `~/.aws`, `~/.config/gcloud`, `~/.azure`
- Reading `~/.npmrc`, `~/.pypirc`, `~/.gem/credentials`
- Reading `.env` files
- Browser profile paths: `Chrome/User Data`, `Firefox/Profiles`, `.config/BraveSoftware`
- Crypto wallet paths: `.bitcoin`, `.ethereum`, `.electrum`, `wallet.dat`
- `process.env` access for: `SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `CREDENTIAL`, `AUTH`
- `os.environ`, `os.getenv` for sensitive vars

**Data exfil libraries:**
- `clipboardy`, `clipboard`, `ncp` (clipboard access)
- `screenshot-desktop`, `desktop-screenshot`
- `node-key-sender`, `iohook` (keylogging)
- `puppeteer`, `playwright` used to access browser sessions/cookies

Grep patterns:
```
discord\.com/api/webhooks
api\.telegram\.org/bot
pastebin\.com|ngrok\.io|ngrok-free\.app
webhook\.site|requestbin|pipedream
http://\d+\.\d+\.\d+\.\d+
\.ssh|\.aws|\.npmrc|\.pypirc|\.gnupg
wallet\.dat|\.bitcoin|\.ethereum|\.electrum
process\.env\[.*(SECRET|TOKEN|KEY|PASSWORD|AUTH)
os\.environ|os\.getenv
```

### E. Persistence / Privilege Escalation

Search for mechanisms that survive a reboot or escalate privileges:

- `crontab` commands, writes to `/etc/cron*`
- systemd unit file creation (`.service` files)
- macOS launch agents/daemons (`~/Library/LaunchAgents`, `com.*.plist`)
- Windows registry: `reg add`, `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Windows startup folder writes
- `sudo` invocations without clear user-facing justification
- Downloading binaries to `/tmp` or temp dirs and executing them
- `chmod +x` on downloaded files then running them

Grep patterns:
```
crontab|/etc/cron
LaunchAgents|LaunchDaemons|\.plist
HKCU.*CurrentVersion.*Run|reg add
sudo |chmod \+x.*&&
/tmp/.*&&.*sh|/tmp/.*&&.*\.\/
systemctl.*enable|systemd
```

### F. Supply-Chain Indicators

Check dependency manifests:

- **Git dependencies** pointing at personal/unknown repos (`git+https://github.com/random-user/`)
- **Typosquat candidates**: dependency names off by one character from popular packages (e.g., `lodsah` vs `lodash`, `reqeusts` vs `requests`)
- **Vendored binaries** in `vendor/`, `third_party/`, `lib/` with no corresponding source
- **Missing lockfile**: `package.json` without `package-lock.json` or `yarn.lock`; `requirements.txt` without hashes
- **Wide version ranges**: `"*"`, `">=0.0.0"`, `""` in dependency versions
- **Dependency confusion**: packages that look like internal/private names on public registries
- **Checksums**: downloaded artifacts without verification (`curl` without `sha256sum` check)

### G. Unicode / Hidden Character Abuse

This is a real attack class. Scan thoroughly:

- **Bidi override characters**: U+202A (LRE), U+202B (RLE), U+202C (PDF), U+202D (LRO), U+202E (RLO), U+2066 (LRI), U+2067 (RLI), U+2068 (FSI), U+2069 (PDI)
- **Zero-width characters**: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+200E (LRM), U+200F (RLM), U+FEFF (BOM in wrong places), U+00AD (soft hyphen)
- **Homoglyphs**: Cyrillic characters that look identical to Latin (а/a, е/e, о/o, р/p, с/c, х/x)
- **Lookalike filenames**: files named to resemble trusted files but using different Unicode characters
- **Invisible whitespace**: non-standard whitespace chars in code that change execution

Use hex dump or `grep -P` for non-ASCII detection:
```bash
grep -rP '[\x{202A}-\x{202E}\x{2066}-\x{2069}]' .
grep -rP '[\x{200B}-\x{200F}\x{FEFF}]' .
grep -rP '[а-яА-Я]' .  # Cyrillic in otherwise Latin source
```

### H. Dangerous File Targets

Search for code that reads or writes sensitive file paths:

- `~/.ssh/id_rsa`, `~/.ssh/id_ed25519`, `~/.ssh/known_hosts`, `~/.ssh/authorized_keys`
- `.env`, `.env.local`, `.env.production`
- `~/.aws/credentials`, `~/.aws/config`
- `~/.gnupg/`, `~/.gpg/`
- Browser profiles: Chrome, Firefox, Brave, Edge user data directories
- Crypto wallets: `.bitcoin/wallet.dat`, `.ethereum/keystore`, `.electrum/wallets`
- Shell RC files: `.bashrc`, `.zshrc`, `.bash_profile`, `.profile`
- Package auth: `.npmrc`, `.pypirc`, `.gem/credentials`, `.cargo/credentials`
- `~/.config/gh/hosts.yml` (GitHub CLI tokens)
- `~/.docker/config.json` (Docker registry auth)
- `~/.kube/config` (Kubernetes credentials)

### I. Social Engineering in Documentation

Read `README.md`, `INSTALL.md`, `CONTRIBUTING.md`, `SETUP.md`, `docs/`, and `wiki/` for:

- "Disable antivirus" / "Disable Windows Defender" / "Disable real-time protection"
- "Run as administrator" / "Run as root" / "Run with sudo"
- "Disable Gatekeeper" / "Disable SIP" / "spctl --master-disable"
- "Paste this into your terminal"
- "Ignore the warning" / "Ignore the error" / "It's a false positive"
- "Download the binary manually from [mega.nz/mediafire/dropbox link]"
- "Add a security exception"
- "Temporarily disable your firewall"
- One-liner install commands: `curl ... | sh`, `wget ... | bash`

Flag these as social engineering concerns. Context matters — a legitimate project may have valid reasons, but it should still be flagged for human review.

### J. CI/CD and Auto-Run Surfaces

Check all CI/CD configurations:
- GitHub Actions: `.github/workflows/*.yml`
  - `${{ secrets.* }}` sent to non-GitHub URLs
  - `actions/checkout` followed by arbitrary script execution
  - Self-hosted runner targeting
  - Workflow dispatch with injectable parameters
- GitLab CI: `.gitlab-ci.yml`
- Jenkins: `Jenkinsfile`
- CircleCI: `.circleci/config.yml`
- Travis: `.travis.yml`
- Auto-merge bots, dependabot configs with auto-merge enabled

## Step 4: Produce Report

After completing all 10 scan categories, produce this structured report:

```markdown
## Security Scan: <owner>/<repo>

**Risk Rating**: SAFE | LOW | MEDIUM | HIGH | CRITICAL

**Scan Date**: <date>
**Commit**: <short hash>
**Files Scanned**: <count>

---

### Findings

#### [CRITICAL/HIGH/MEDIUM/LOW/INFO] <finding-title>
- **File**: `path/to/file:line`
- **Pattern**: <what was detected>
- **Context**: <why this is or isn't concerning, with surrounding code context>

... (repeat for each finding, ordered by severity) ...

---

### Summary

| Severity | Count |
|----------|-------|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |
| Info | N |

### Recommendation

One of:
- **SAFE**: No findings. Safe to clone and use normally.
- **LOW RISK**: Minor informational items only. Safe to use with normal caution.
- **MEDIUM RISK**: Review flagged items before running. Build in sandbox first.
- **HIGH RISK**: Do not run. Clone for read-only inspection in isolated environment only.
- **CRITICAL**: Avoid entirely. Multiple indicators of malicious intent detected.
```

## Step 5: Cleanup

Always run at the end:
```bash
rm -rf /tmp/security-scan-*
```

## Contextual Judgment

Not every match is malicious. Apply judgment:
- `process.env.NODE_ENV` is normal; `process.env.AWS_SECRET_ACCESS_KEY` sent to a webhook is not
- `eval()` in a template engine is different from `eval()` decoding a base64 payload
- A `postinstall` script that runs `husky install` is normal; one that runs `curl | sh` is not
- `exec()` in a test runner is different from `exec(base64.b64decode(...))`

When in doubt, flag it with context and let the human decide. It's better to over-report than to miss something.
