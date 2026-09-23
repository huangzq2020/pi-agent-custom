import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentRuntime, RuntimeRequest, RuntimeResult } from "../types.ts";

const readOnlyTools = ["read", "grep", "find", "ls"];

export interface PiAgentRuntimeAdapterOptions {
	sessionDirectory?: string;
	customTools?: ToolDefinition[];
	readOnlyCustomToolNames?: string[];
}

export class PiAgentRuntimeAdapter implements AgentRuntime {
	readonly #sessionDirectory: string;
	readonly #customTools: ToolDefinition[];
	readonly #readOnlyCustomToolNames: string[];

	constructor(options: PiAgentRuntimeAdapterOptions = {}) {
		this.#sessionDirectory = options.sessionDirectory ?? join(homedir(), ".pi", "mobile-os", "sessions");
		this.#customTools = [...(options.customTools ?? [])];
		this.#readOnlyCustomToolNames = [...(options.readOnlyCustomToolNames ?? [])];
	}

	async run(request: RuntimeRequest, onEvent: Parameters<AgentRuntime["run"]>[1]): Promise<RuntimeResult> {
		if (request.signal.aborted) throw request.signal.reason;
		let suppressTextEvents = false;
		const sessionManager = request.sessionId
			? SessionManager.open(
					join(this.#sessionDirectory, `${validSessionId(request.sessionId)}.jsonl`),
					this.#sessionDirectory,
					request.cwd,
				)
			: SessionManager.inMemory(request.cwd);
		const { session } = await createAgentSession({
			cwd: request.cwd,
			tools: request.readOnly ? [...readOnlyTools, ...this.#readOnlyCustomToolNames] : undefined,
			customTools: this.#customTools,
			sessionManager,
		});
		const unsubscribe = session.subscribe((event) => {
			if (
				!suppressTextEvents &&
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				onEvent({ type: "text_delta", text: event.assistantMessageEvent.delta });
			} else if (event.type === "tool_execution_start") {
				onEvent({ type: "tool_start", toolName: event.toolName, toolCallId: event.toolCallId });
			} else if (event.type === "tool_execution_end") {
				onEvent({
					type: "tool_end",
					toolName: event.toolName,
					toolCallId: event.toolCallId,
					isError: event.isError,
				});
			}
		});
		const abort = (): void => {
			void session.abort();
		};
		request.signal.addEventListener("abort", abort, { once: true });
		try {
			await session.prompt(request.prompt, { source: "rpc" });
			let text = session.getLastAssistantText() ?? "";
			if (needsChineseRewrite(text)) {
				suppressTextEvents = true;
				await session.prompt(
					[
						"将你上一条最终回答完整改写为简体中文。",
						"保留代码、命令、文件路径和必要的技术专有名词，不要增加新的分析或改动。",
						"只输出改写后的中文回答，不要解释翻译过程。",
					].join("\n"),
					{ source: "rpc" },
				);
				text = session.getLastAssistantText() ?? text;
			}
			return { text };
		} finally {
			request.signal.removeEventListener("abort", abort);
			unsubscribe();
			session.dispose();
		}
	}
}

function validSessionId(value: string): string {
	if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(value)) {
		throw new Error("Mobile conversation session id is invalid");
	}
	return value;
}

export function needsChineseRewrite(text: string): boolean {
	const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
	const chineseCharacters = prose.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
	const latinWords = prose.match(/[a-z]{2,}/giu)?.length ?? 0;
	return latinWords >= 3 && chineseCharacters < 8;
}
