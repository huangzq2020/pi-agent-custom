import type { MobileRuntimeExtension, RuntimeEvent, RuntimeTaskContext } from "../types.ts";

export class RuntimeExtensionHost {
	readonly #extensions: MobileRuntimeExtension[] = [];

	register(extension: MobileRuntimeExtension): void {
		if (this.#extensions.some((candidate) => candidate.id === extension.id)) {
			throw new Error(`Runtime extension already registered: ${extension.id}`);
		}
		this.#extensions.push(extension);
	}

	async beforeTask(context: RuntimeTaskContext): Promise<void> {
		for (const extension of this.#extensions) await extension.beforeTask?.(context);
	}

	async transformPrompt(prompt: string, context: RuntimeTaskContext): Promise<string> {
		let transformed = prompt;
		for (const extension of this.#extensions) {
			transformed = (await extension.transformPrompt?.(transformed, context)) ?? transformed;
		}
		return transformed;
	}

	async onRuntimeEvent(event: RuntimeEvent, context: RuntimeTaskContext): Promise<void> {
		for (const extension of this.#extensions) await extension.onRuntimeEvent?.(event, context);
	}

	async afterTask(context: RuntimeTaskContext, result: unknown): Promise<void> {
		for (const extension of this.#extensions) await extension.afterTask?.(context, result);
	}
}

export function createMobileContextExtension(): MobileRuntimeExtension {
	return {
		id: "mobile-context",
		transformPrompt: (prompt, context) =>
			[
				"你正在通过 Pi-Agent Mobile OS 执行任务。",
				`项目：${context.project.name}`,
				`主要语言：${context.project.languages.join("、") || "未知"}`,
				"所有面向用户的说明、分析过程和最终报告必须使用简体中文。",
				"代码、命令、文件路径和必要的技术专有名词保留原文；英文文档应理解后用中文概括，不要大段复制英文。",
				"内容应适合手机阅读，使用简短小标题和短段落，并在最后总结具体结论、改动与验证结果。",
				"",
				prompt,
			].join("\n"),
	};
}
