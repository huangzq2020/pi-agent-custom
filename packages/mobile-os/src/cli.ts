import { createMobileOs } from "./application.ts";

const host = process.env.PI_MOBILE_HOST ?? "127.0.0.1";
const port = parsePort(process.env.PI_MOBILE_PORT);
const token = process.env.PI_MOBILE_TOKEN;
if (!isLoopback(host) && !token) throw new Error("PI_MOBILE_TOKEN is required when listening beyond loopback");

const gateway = await createMobileOs({
	host,
	port,
	token,
	projectRoots: splitList(process.env.PI_MOBILE_PROJECT_ROOTS) ?? [process.cwd()],
	workflowDirectory: process.env.PI_MOBILE_WORKFLOW_DIR,
	marketplaceRoot: process.env.PI_MOBILE_MARKETPLACE_ROOT,
	allowedOrigins: splitList(process.env.PI_MOBILE_ALLOWED_ORIGINS),
	concurrency: parseConcurrency(process.env.PI_MOBILE_CONCURRENCY),
	dataDirectory: process.env.PI_MOBILE_DATA_DIR,
	githubToken: process.env.PI_MOBILE_GITHUB_TOKEN,
});
const address = await gateway.start();
process.stdout.write(`Pi-Agent Mobile OS gateway listening on http://${address.host}:${address.port}\n`);

const shutdown = async (): Promise<void> => {
	await gateway.stop();
	process.exitCode = 0;
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

function parsePort(value: string | undefined): number {
	if (value === undefined) return 8787;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) throw new Error("PI_MOBILE_PORT is invalid");
	return parsed;
}

function parseConcurrency(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) throw new Error("PI_MOBILE_CONCURRENCY is invalid");
	return parsed;
}

function splitList(value: string | undefined): string[] | undefined {
	return value
		?.split(";")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function isLoopback(value: string): boolean {
	return value === "127.0.0.1" || value === "::1" || value === "localhost";
}
