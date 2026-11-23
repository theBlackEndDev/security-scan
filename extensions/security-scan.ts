/**
 * security-scan pi extension.
 *
 * PURPOSE:  (1) Suggest the security-scan skill when the user types a GitHub URL (D5).
 *           (2) Warn before a bash command clones, installs or builds a GitHub repo that
 *               has no scan record or a HIGH/CRITICAL rating (D14, D15).
 * BLOCKING: No. The tool_call handler never returns `block`.
 *
 * Channels:
 *   input: only for typed (interactive) input. The user's text is not rewritten. The
 *     suggestion is held and injected by before_agent_start as a custom message.
 *   tool_call: ctx.ui.notify for the user, plus a steer message the model sees before its
 *     next LLM call. The command still runs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findGitHubRepo, suggestion } from "../hooks/core";
import { classifyCommand, latestRating } from "../hooks/scan-record";

const CUSTOM_TYPE = "security-scan";

function warningFor(command: string, cwd: string): string | null {
  const hit = classifyCommand(command, cwd);
  if (!hit) return null;
  const rating = latestRating(hit.ownerRepo);
  let why: string;
  if (rating === null) why = "has never been scanned";
  else if (rating === "HIGH" || rating === "CRITICAL") why = `was last rated ${rating}`;
  else return null;
  return (
    `security-scan: this command touches github.com/${hit.ownerRepo}, which ${why}. ` +
    `Suggest the user run the security-scan skill on ${hit.ownerRepo} ` +
    `(/skill:security-scan https://github.com/${hit.ownerRepo}). ` +
    `This is advisory only; do not refuse the command.`
  );
}

export default function (pi: ExtensionAPI) {
  let pending: string | null = null;

  pi.on("input", async (event) => {
    pending = null;
    if (event.source !== "interactive") return { action: "continue" as const };
    const url = findGitHubRepo(event.text);
    if (url) pending = suggestion(url, "pi");
    return { action: "continue" as const };
  });

  pi.on("before_agent_start", async (event) => {
    const text = pending;
    pending = null;
    if (!text || (event as any).messageType === "custom") return;
    return { message: { customType: CUSTOM_TYPE, content: text, display: true } };
  });

  pi.on("tool_call", async (event, ctx) => {
    try {
      if (event.toolName !== "bash") return;
      const command = (event.input as any)?.command;
      if (typeof command !== "string") return;
      const message = warningFor(command, ctx.cwd);
      if (!message) return;
      ctx.ui?.notify?.(message, "warning");
      pi.sendMessage(
        { customType: CUSTOM_TYPE, content: message, display: false },
        { deliverAs: "steer" },
      );
    } catch {
      // advisory only: never fail the tool call
    }
    return undefined;
  });
}
