import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskAssessment {
	level: RiskLevel;
	reason: string;
}

const highRiskShellRules: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /\bgit\s+reset\s+--hard\b/i, reason: "git reset --hard can discard local changes" },
	{ pattern: /\bgit\s+push\b[^\r\n]*(?:--force(?:-with-lease)?|(?:^|\s)-f(?:\s|$))/i, reason: "force push can rewrite remote history" },
	{ pattern: /\bgit\s+clean\b[^\r\n]*\s-[a-z]*f/i, reason: "git clean can permanently delete untracked files" },
	{ pattern: /\brm\b[^\r\n;&|]*(?:\s-[a-z]*r[a-z]*|\s--recursive)(?:\s|$)/i, reason: "recursive removal can delete many files" },
	{ pattern: /\bRemove-Item\b[^\r\n]*(?:-Recurse|-Force)[^\r\n]*(?:-Recurse|-Force)/i, reason: "recursive forced removal can delete many files" },
	{ pattern: /\b(?:rmdir|rd)\b[^\r\n]*\/s\b/i, reason: "recursive directory removal can delete many files" },
];

const mediumRiskShellRules: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|upgrade)\b/i, reason: "dependency operation can change installed or locked packages" },
	{ pattern: /\bgit\s+(?:checkout|switch)\b/i, reason: "branch or checkout operation can change the working tree" },
	{ pattern: /\bgit\s+merge\b/i, reason: "merge can change the working tree and history" },
	{ pattern: /\bgit\s+(?:commit|push|rebase)\b/i, reason: "Git history or remote state will change" },
];

export function assessToolCall(toolName: string, input: Record<string, unknown>): RiskAssessment {
	if (["read", "grep", "find", "ls", "repo_map"].includes(toolName)) {
		return { level: "low", reason: "read-only operation" };
	}
	if (toolName === "edit") {
		const oldText = typeof input.oldText === "string" ? input.oldText : "";
		const newText = typeof input.newText === "string" ? input.newText : "";
		if (newText.length === 0 && (oldText.length >= 10_000 || oldText.split(/\r?\n/u).length >= 100)) {
			return { level: "high", reason: "edit removes a large block of file content" };
		}
		return { level: "medium", reason: "edit changes a file" };
	}
	if (toolName === "write") return { level: "medium", reason: "write creates or replaces a file" };
	if (toolName !== "bash") return { level: "low", reason: "no guarded rule matched" };

	const command = typeof input.command === "string" ? input.command : "";
	if (/^\s*git\s+status(?:\s|$)/i.test(command)) return { level: "low", reason: "git status is read-only" };
	for (const rule of highRiskShellRules) {
		if (rule.pattern.test(command)) return { level: "high", reason: rule.reason };
	}
	for (const rule of mediumRiskShellRules) {
		if (rule.pattern.test(command)) return { level: "medium", reason: rule.reason };
	}
	return { level: "medium", reason: "shell command requires an audit record" };
}

function summarizeCall(toolName: string, input: Record<string, unknown>): string {
	if (toolName === "bash" && typeof input.command === "string") return input.command.slice(0, 800);
	const path = typeof input.path === "string" ? input.path : undefined;
	return path ? `${toolName}: ${path}` : toolName;
}

export default function toolGuardExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		const assessment = assessToolCall(event.toolName, event.input);
		if (assessment.level === "low") return;

		const summary = summarizeCall(event.toolName, event.input);
		if (assessment.level === "medium") {
			pi.appendEntry("tool-guard-audit", {
				level: assessment.level,
				reason: assessment.reason,
				toolName: event.toolName,
				decision: "allowed",
				timestamp: new Date().toISOString(),
			});
			if (ctx.hasUI) ctx.ui.notify(`Tool Guard: ${assessment.reason}\n${summary}`, "warning");
			return;
		}

		if (!ctx.hasUI) {
			pi.appendEntry("tool-guard-audit", {
				level: assessment.level,
				reason: assessment.reason,
				toolName: event.toolName,
				decision: "blocked-no-ui",
				timestamp: new Date().toISOString(),
			});
			return { block: true, reason: `Tool Guard blocked high-risk operation: ${assessment.reason}`, terminate: true };
		}
		const confirmed = await ctx.ui.confirm(
			"Confirm high-risk tool call",
			`${assessment.reason}\n\n${summary}\n\nAllow this operation?`,
		);
		pi.appendEntry("tool-guard-audit", {
			level: assessment.level,
			reason: assessment.reason,
			toolName: event.toolName,
			decision: confirmed ? "confirmed" : "rejected",
			timestamp: new Date().toISOString(),
		});
		if (!confirmed) {
			return { block: true, reason: `User rejected high-risk operation: ${assessment.reason}`, terminate: true };
		}
	});
}
