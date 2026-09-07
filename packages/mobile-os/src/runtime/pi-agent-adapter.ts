import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentRuntime, RuntimeRequest, RuntimeResult } from "../types.ts";

const readOnlyTools = ["read", "grep", "find", "ls"];

export class PiAgentRuntimeAdapter implements AgentRuntime {
	async run(request: RuntimeRequest, onEvent: Parameters<AgentRuntime["run"]>[1]): Promise<RuntimeResult> {
		if (request.signal.aborted) throw request.signal.reason;
		let suppressTextEvents = false;
		const { session } = await createAgentSession({
			cwd: request.cwd,
			tools: request.readOnly ? readOnlyTools : undefined,
			sessionManager: SessionManager.inMemory(request.cwd),
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

export function needsChineseRewrite(text: string): boolean {
	const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
	const chineseCharacters = prose.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
	const latinWords = prose.match(/[a-z]{2,}/giu)?.length ?? 0;
	return latinWords >= 3 && chineseCharacters < 8;
}
