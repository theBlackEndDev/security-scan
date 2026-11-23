#!/usr/bin/env bun
/**
 * url-hint.ts <claude|codex|antigravity>
 *
 * PURPOSE:  Detect a GitHub repo URL in the user's prompt and suggest running the
 *           security-scan skill before cloning or running it.
 * TRIGGER:  UserPromptSubmit (Claude, Codex), PreInvocation (Antigravity)
 * BLOCKING: No (D1). Always exits 0. Prints nothing on bad input or no URL.
 *
 * Output:
 *   claude, codex: stdout {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"…"}}
 *   antigravity:   stdout {"injectSteps":[{"ephemeralMessage":"…"}]}
 *
 * Antigravity fires PreInvocation before every model call, not once per prompt (D4).
 * No stdin field marks the first call, so a marker file keyed by conversationId plus a
 * hash of lastUserInput makes one user turn get one suggestion.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findGitHubRepo, suggestion } from "./core";

type Harness = "claude" | "codex" | "antigravity";

function promptOf(harness: Harness, input: any): string | null {
  const text = harness === "antigravity" ? input?.lastUserInput : input?.prompt;
  return typeof text === "string" ? text : null;
}

/** True the first time this (conversation, prompt) pair is seen. Fails open: on any fs error, say yes. */
function firstCall(input: any, prompt: string): boolean {
  try {
    const key = createHash("sha1")
      .update(`${String(input?.conversationId ?? "")}\0${prompt}`)
      .digest("hex");
    const dir = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "security-scan", "hinted");
    const marker = join(dir, key);
    if (existsSync(marker)) return false;
    mkdirSync(dir, { recursive: true });
    writeFileSync(marker, "");
    return true;
  } catch {
    return true;
  }
}

function emit(harness: Harness, message: string): void {
  if (harness === "antigravity") {
    process.stdout.write(JSON.stringify({ injectSteps: [{ ephemeralMessage: message }] }));
    return;
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: message },
    }),
  );
}

async function main() {
  const harness = process.argv[2] as Harness;
  if (harness !== "claude" && harness !== "codex" && harness !== "antigravity") return;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    const prompt = promptOf(harness, input);
    if (prompt === null) return;
    const url = findGitHubRepo(prompt);
    if (!url) return;
    if (harness === "antigravity" && !firstCall(input, prompt)) return;
    emit(harness, suggestion(url, harness));
  } catch {
    // bad input: say nothing
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
