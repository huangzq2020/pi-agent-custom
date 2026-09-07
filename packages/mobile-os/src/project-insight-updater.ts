import type { ProjectAlert, ProjectProfile, TaskSnapshot } from "./types.ts";

const featureWorkflows = new Set(["detailed_analysis", "code_explain", "project_analysis"]);

export function updateProjectInsights(project: ProjectProfile, task: TaskSnapshot, result: unknown): void {
	const text = resultText(result);
	if (!text || !containsChinese(text)) return;

	if (task.kind === "chat" || featureWorkflows.has(task.workflowId ?? "")) {
		const summary = extractSectionLead(text, ["项目目标", "项目简介", "系统目标", "主要用途"]);
		if (summary) project.summary = summary;
		const features = extractSectionItems(text, ["核心功能", "主要功能", "功能特点", "系统能力", "模块职责"]);
		if (features.length > 0) project.featureHighlights = features;
	}

	if (task.workflowId === "bug_scan") {
		project.alerts = replaceAlerts(project.alerts, "bug", extractAlerts(text, "bug"));
	}
	if (task.workflowId === "security_check") {
		project.alerts = replaceAlerts(project.alerts, "security", extractAlerts(text, "security"));
	}
	project.insightsUpdatedAt = new Date().toISOString();
}

function resultText(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (!isRecord(value)) return undefined;
	if (typeof value.text === "string") return value.text;
	const output = resultText(value.output);
	if (output) return output;
	if (!Array.isArray(value.steps)) return undefined;
	for (let index = value.steps.length - 1; index >= 0; index--) {
		const step = value.steps[index];
		if (!isRecord(step)) continue;
		const text = resultText(step.output);
		if (text) return text;
	}
	return undefined;
}

function extractSectionLead(text: string, headings: string[]): string | undefined {
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		if (!isHeading(lines[index], headings)) continue;
		for (const candidate of lines.slice(index + 1)) {
			if (/^\s*#{1,6}\s+/.test(candidate)) break;
			const cleaned = cleanLine(candidate);
			if (isUsefulSummary(cleaned)) return ensureSentence(cleaned);
		}
	}
	return undefined;
}

function extractSectionItems(text: string, headings: string[]): string[] {
	const lines = text.split(/\r?\n/);
	const items: string[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (!isHeading(lines[index], headings)) continue;
		for (const candidate of lines.slice(index + 1)) {
			if (/^\s*#{1,6}\s+/.test(candidate)) break;
			if (!/^\s*(?:[-*+] |\d+[.)] )/.test(candidate)) continue;
			const cleaned = cleanLine(candidate);
			if (isUsefulFeature(cleaned) && !items.includes(cleaned)) items.push(cleaned);
			if (items.length === 3) return items;
		}
	}
	return items;
}

function extractAlerts(text: string, kind: ProjectAlert["kind"]): ProjectAlert[] {
	if (/(?:未发现|没有发现|未检测到|不存在)(?:明显|重要|高危|严重)?(?:问题|缺陷|漏洞|风险)/u.test(text)) {
		return [];
	}
	const keywords =
		kind === "security"
			? /(?:高危|严重|中危|风险|漏洞|注入|越权|泄露|密钥|认证|授权)/iu
			: /(?:P[0-2]|高危|严重|中危|Bug|缺陷|错误|崩溃|竞态|死锁|风险)/iu;
	const alerts: ProjectAlert[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!/^\s*(?:#{2,6}\s+|[-*+] |\d+[.)] )/.test(line) || !keywords.test(line)) continue;
		const cleaned = cleanLine(line);
		if (!isUsefulAlert(cleaned) || alerts.some((alert) => alert.text === cleaned)) continue;
		alerts.push({
			kind,
			severity: /(?:P0|P1|高危|严重|critical|high)/iu.test(cleaned) ? "critical" : "warning",
			text: cleaned,
		});
		if (alerts.length === 2) break;
	}
	return alerts;
}

function replaceAlerts(
	current: ProjectAlert[] | undefined,
	kind: ProjectAlert["kind"],
	replacement: ProjectAlert[],
): ProjectAlert[] {
	return [...(current ?? []).filter((alert) => alert.kind !== kind), ...replacement].slice(-4);
}

function isHeading(line: string, headings: string[]): boolean {
	const heading = line
		.replace(/^\s*#{1,6}\s*/, "")
		.replace(/[：:]+$/, "")
		.trim();
	return headings.some((candidate) => heading.includes(candidate));
}

function cleanLine(line: string): string {
	return line
		.replace(/^\s*(?:#{1,6}\s+|[-*+] |\d+[.)] )/, "")
		.replace(/\*\*/g, "")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 100);
}

function isUsefulSummary(value: string): boolean {
	return containsChinese(value) && value.length >= 12 && value.length <= 100 && !looksLikePath(value);
}

function isUsefulFeature(value: string): boolean {
	return containsChinese(value) && value.length >= 6 && value.length <= 60 && !looksLikePath(value);
}

function isUsefulAlert(value: string): boolean {
	return (
		containsChinese(value) &&
		value.length >= 8 &&
		value.length <= 100 &&
		!/^(?:风险|问题|缺陷|安全审查|Bug 检测|检测结果)$/u.test(value)
	);
}

function looksLikePath(value: string): boolean {
	return /(?:[\\/][\w.-]+){2,}|\.(?:ts|dart|js|json|yaml|md)\b/iu.test(value);
}

function ensureSentence(value: string): string {
	return /[。！？]$/u.test(value) ? value : `${value}。`;
}

function containsChinese(value: string): boolean {
	return /[\u3400-\u9fff]/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
