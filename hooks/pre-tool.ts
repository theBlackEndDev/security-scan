#!/usr/bin/env bun
/**
 * pre-tool.ts <claude|codex|antigravity>
 *
 * PURPOSE:  Warn before a shell command clones, installs or builds a GitHub
 *           repo that has no scan record, or whose latest rating is HIGH or
 *           CRITICAL (D14).
 * TRIGGER:  PreToolUse (Claude/Codex matcher Bash, Antigravity run_command)
 * BLOCKING: No (D1). Always exits 0. Never emits deny, block or ask.
 *
 * Channels (D15):
 *   claude, codex: stdout {"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"…"}}
 *   antigravity:   stdout {"decision":"allow","reason":"…"} ("decision" is required there;
 *                  "allow" defers to the default policy) plus the text on stderr for the user.
 */

import { classifyCommand, latestRating } from "./scan-record";

type Harness = "claude" | "codex" | "antigravity";

interface Extracted {
  command: string;
  cwd: string;
}

function extract(harness: Harness, input: any): Extracted | null {
  if (harness === "antigravity") {
    const call = input?.toolCall;
    if (call?.name !== "run_command") return null;
    const command = call?.args?.CommandLine;
    if (typeof command !== "string") return null;
    const cwd = input?.workspacePaths?.[0] ?? call?.args?.Cwd ?? process.cwd();
    return { command, cwd };
  }
  const command = input?.tool_input?.command;
  if (typeof command !== "string") return null;
  return { command, cwd: typeof input?.cwd === "string" ? input.cwd : process.cwd() };
}

export function buildWarning(command: string, cwd: string): string | null {
  const hit = classifyCommand(command, cwd);
  if (!hit) return null;
  const rating = latestRating(hit.ownerRepo);
  let why: string;
  if (rating === null) why = "has never been scanned";
  else if (rating === "HIGH" || rating === "CRITICAL") why = `was last rated ${rating}`;
  else return null;
  return (
    `security-scan: this command touches github.com/${hit.ownerRepo}, which ${why}. ` +
    `Before running it, suggest the user run the security-scan skill on ${hit.ownerRepo}. ` +
    `This is advisory only; do not refuse the command.`
  );
}

function emit(harness: Harness, message: string | null): void {
  if (harness === "antigravity") {
    if (message) process.stderr.write(message + "\n");
    process.stdout.write(
      JSON.stringify(message ? { decision: "allow", reason: message } : { decision: "allow" }),
    );
    return;
  }
  if (!message) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: message },
    }),
  );
}

async function main() {
  const harness = process.argv[2] as Harness;
  if (harness !== "claude" && harness !== "codex" && harness !== "antigravity") return;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

  let message: string | null = null;
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    const got = extract(harness, input);
    if (got) message = buildWarning(got.command, got.cwd);
  } catch {
    message = null;
  }
  emit(harness, message);
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
