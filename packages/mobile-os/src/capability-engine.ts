import type { Capability, DynamicUi, ProjectProfile } from "./types.ts";

const projectAnalysis: Capability = {
	id: "project-analysis",
	title: "项目分析",
	description: "扫描项目技术栈并生成动态能力。",
	workflowId: "project_analysis",
	category: "analysis",
	destructive: false,
};

const commonCapabilities: Capability[] = [
	{
		id: "detailed-analysis",
		title: "详细分析",
		description: "深入说明架构、模块边界、数据流、风险与扩展方式。",
		workflowId: "detailed_analysis",
		category: "analysis",
		destructive: false,
	},
	{
		id: "bug-scan",
		title: "Bug 检测",
		description: "结合项目结构和当前差异定位高风险缺陷。",
		workflowId: "bug_scan",
		category: "quality",
		destructive: false,
	},
	{
		id: "security-check",
		title: "安全检查",
		description: "检查身份验证、输入处理、依赖和敏感信息风险。",
		workflowId: "security_check",
		category: "security",
		destructive: false,
	},
	{
		id: "code-explain",
		title: "代码解释",
		description: "解释模块职责、数据流和关键依赖。",
		workflowId: "code_explain",
		category: "project",
		destructive: false,
	},
	{
		id: "generate-tests",
		title: "测试生成",
		description: "为薄弱路径生成并运行针对性测试。",
		workflowId: "test_generation",
		category: "testing",
		destructive: true,
	},
	{
		id: "refactor",
		title: "代码重构",
		description: "在保持行为的前提下实施小范围重构。",
		workflowId: "refactor",
		category: "refactor",
		destructive: true,
	},
];

export class CapabilityEngine {
	recommend(profile?: ProjectProfile): DynamicUi {
		if (!profile) return { buttons: [projectAnalysis] };
		const buttons = [...commonCapabilities];
		if (profile.caches.includes("Redis")) {
			buttons.push({
				id: "redis-check",
				title: "Redis 缓存分析",
				description: "检查缓存键设计、失效策略、穿透和一致性。",
				workflowId: "redis_check",
				category: "project",
				destructive: false,
			});
		}
		if (profile.manifests.some((manifest) => manifest.endsWith("Dockerfile"))) {
			buttons.push({
				id: "docker-review",
				title: "容器配置检查",
				description: "检查镜像体积、权限、密钥和构建缓存。",
				workflowId: "docker_review",
				category: "security",
				destructive: false,
			});
		}
		return { projectId: profile.id, buttons };
	}
}
