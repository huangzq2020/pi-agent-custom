import { describe, expect, it } from "vitest";
import { needsChineseRewrite } from "../src/runtime/pi-agent-adapter.ts";

describe("mobile runtime response language", () => {
	it("requests a rewrite for an English report", () => {
		expect(needsChineseRewrite("The bug scan found a critical authorization issue.")).toBe(true);
	});

	it("keeps a Chinese report with technical terms", () => {
		expect(needsChineseRewrite("检测发现 Gateway 存在一个高风险授权问题，请检查 API token。")).toBe(false);
	});
});
