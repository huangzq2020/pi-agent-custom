import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const MODE_PROFILES = {
	bugfix: {
		label: "Bug Fix",
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash", "repo_map"],
	},
	review: {
		label: "Code Review",
		tools: ["read", "grep", "find", "ls", "repo_map"],
	},
	refactor: {
		label: "Refactor",
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash", "repo_map"],
	},
	test: {
		label: "Test",
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash", "repo_map"],
	},
} as const;

export type SkillMode = keyof typeof MODE_PROFILES;

export function isSkillMode(value: string): value is SkillMode {
	return Object.hasOwn(MODE_PROFILES, value);
}

export function toolsForMode(mode: SkillMode, availableTools: string[]): string[] {
	const available = new Set(availableTools);
	return MODE_PROFILES[mode].tools.filter((tool) => available.has(tool));
}

export default function skillProfileExtension(pi: ExtensionAPI): void {
	let activeMode: SkillMode | undefined;
	let skillInstructions: string | undefined;
	let originalTools: string[] | undefined;

	pi.registerCommand("mode", {
		description: "Switch engineering mode: bugfix, review, refactor, test, or off",
		getArgumentCompletions: (prefix) => {
			const modes = [...Object.keys(MODE_PROFILES), "off"];
			const matches = modes.filter((mode) => mode.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((mode) => ({ value: mode, label: mode })) : null;
		},
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			if (!requested) {
				ctx.ui.notify(activeMode ? `Current mode: ${activeMode}` : "No engineering mode is active", "info");
				return;
			}
			if (requested === "off") {
				if (originalTools) pi.setActiveTools(originalTools);
				activeMode = undefined;
				skillInstructions = undefined;
				ctx.ui.notify("Engineering mode disabled", "info");
				return;
			}
			if (!isSkillMode(requested)) {
				ctx.ui.notify(`Unknown mode: ${requested}. Use bugfix, review, refactor, test, or off.`, "error");
				return;
			}

			try {
				const skillPath = join(ctx.cwd, ".pi", "skills", requested, "SKILL.md");
				const instructions = await readFile(skillPath, "utf8");
				originalTools ??= pi.getActiveTools();
				const availableTools = pi.getAllTools().map((tool) => tool.name);
				const activeTools = toolsForMode(requested, availableTools);
				if (!activeTools.includes("repo_map")) throw new Error("repo_map is not registered");
				activeMode = requested;
				skillInstructions = instructions;
				pi.setActiveTools(activeTools);
				ctx.ui.notify(`${MODE_PROFILES[requested].label} mode enabled (${activeTools.join(", ")})`, "info");
			} catch (error) {
				ctx.ui.notify(`Failed to enable ${requested}: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (!activeMode || !skillInstructions) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n# Active Engineering Mode: ${MODE_PROFILES[activeMode].label}\n\n${skillInstructions}`,
		};
	});
}
