#!/usr/bin/env bun
/**
 * GitHubUrlDetector.hook.ts
 *
 * PURPOSE:  Detect GitHub repository URLs in user prompts and suggest
 *           running /security-scan before cloning or executing.
 * TRIGGER:  UserPromptSubmit
 * BLOCKING: No — always exits 0. Suggestion only.
 */

const GITHUB_URL_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/i;
const SHORTHAND_RE = /\bgithub\.com\/[\w.-]+\/[\w.-]+/i;

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  let input: { session_id?: string; prompt?: string };
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    process.exit(0);
  }

  const prompt = input.prompt ?? "";

  // Don't suggest if user is already invoking the skill
  if (prompt.includes("/security-scan")) {
    process.exit(0);
  }

  const match = prompt.match(GITHUB_URL_RE) ?? prompt.match(SHORTHAND_RE);
  if (!match) {
    process.exit(0);
  }

  const url = match[0].startsWith("http") ? match[0] : `https://${match[0]}`;

  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `GitHub repository detected: ${url} — Run /security-scan ${url} to scan for security issues before cloning or running.`,
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch(() => process.exit(0));
