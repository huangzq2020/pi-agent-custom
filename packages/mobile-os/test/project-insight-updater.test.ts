import { describe, expect, it } from "vitest";
import { updateProjectInsights } from "../src/project-insight-updater.ts";
import type { ProjectProfile, TaskSnapshot } from "../src/types.ts";

const project: ProjectProfile = {
	id: "project-1",
	root: "D:/code/project",
	name: "project",
	summary: "初始项目简介。",
	languages: ["TypeScript"],
	frameworks: [],
	databases: [],
	caches: [],
	packageManagers: ["npm"],
	manifests: ["package.json"],
	hasGit: true,
	fileCount: 10,
	analyzedAt: "2026-08-27T00:00:00.000Z",
	featureHighlights: [],
	alerts: [],
};

describe("project insight updater", () => {
	it("updates the concise summary and feature highlights from analysis", () => {
		const current = structuredClone(project);
		updateProjectInsights(current, task("detailed_analysis"), {
			output: [
				"## 项目目标",
				"为移动端提供项目分析、远程文件访问和 Agent 自动化能力。",
				"",
				"## 核心功能",
				"- 支持绑定电脑并浏览远程项目",
				"- 提供项目分析和代码解释工作流",
				"- 保存每次 Agent 任务的历史记录",
			].join("\n"),
		});

		expect(current.summary).toBe("为移动端提供项目分析、远程文件访问和 Agent 自动化能力。");
		expect(current.featureHighlights).toEqual([
			"支持绑定电脑并浏览远程项目",
			"提供项目分析和代码解释工作流",
			"保存每次 Agent 任务的历史记录",
		]);
	});

	it("replaces bug findings and clears them after a clean scan", () => {
		const current = structuredClone(project);
		updateProjectInsights(current, task("bug_scan"), {
			output: "## 检测结果\n- 高危：任务取消后仍可能写入项目，导致状态不一致。",
		});
		expect(current.alerts).toEqual([
			{
				kind: "bug",
				severity: "critical",
				text: "高危：任务取消后仍可能写入项目，导致状态不一致。",
			},
		]);

		updateProjectInsights(current, task("bug_scan"), { output: "本次检查未发现重要问题。" });
		expect(current.alerts).toEqual([]);
	});
});

function task(workflowId: string): TaskSnapshot {
	return {
		id: `task-${workflowId}`,
		projectId: project.id,
		projectName: project.name,
		title: workflowId,
		kind: "workflow",
		status: "RUNNING",
		createdAt: "2026-08-27T00:00:00.000Z",
		updatedAt: "2026-08-27T00:00:00.000Z",
		workflowId,
		progress: 0,
	};
}
