import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ignoredDirectories = new Set([
	".git",
	".next",
	".turbo",
	".venv",
	"__pycache__",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"target",
	"vendor",
	"venv",
]);
const manifestNames = new Set([
	"Cargo.toml",
	"Gemfile",
	"build.gradle",
	"build.gradle.kts",
	"composer.json",
	"go.mod",
	"package.json",
	"pom.xml",
	"pyproject.toml",
	"requirements.txt",
	"tsconfig.json",
]);
const entryPointPattern = /(?:^|\/)(?:(?:src|app)\/)?(?:main|index|app|server|cli)\.(?:[cm]?[jt]sx?|py|go|rs)$/i;
const maxEntries = 750;

export interface RepoMap {
	root: string;
	technology: string[];
	entryPoints: string[];
	modules: string[];
	testFrameworks: string[];
	buildCommands: string[];
	manifests: string[];
	structure: string[];
	truncated: boolean;
}

interface ScanResult {
	files: string[];
	directories: string[];
	truncated: boolean;
}

export async function buildRepoMap(root: string, maxDepth = 3, signal?: AbortSignal): Promise<RepoMap> {
	const absoluteRoot = resolve(root);
	const scan = await scanRepository(absoluteRoot, maxDepth, signal);
	const manifests = scan.files.filter((path) => manifestNames.has(basename(path)));
	const packageFiles = manifests.filter((path) => basename(path) === "package.json");
	const packageMetadata = await Promise.all(packageFiles.slice(0, 30).map((path) => readPackageMetadata(absoluteRoot, path)));

	const technology = new Set<string>();
	const testFrameworks = new Set<string>();
	const buildCommands = new Set<string>();
	const entryPoints = new Set(scan.files.filter((path) => entryPointPattern.test(path)));

	detectFromFiles(scan.files, manifests, technology, testFrameworks, buildCommands);
	for (const metadata of packageMetadata) {
		for (const item of metadata.technology) technology.add(item);
		for (const item of metadata.testFrameworks) testFrameworks.add(item);
		for (const item of metadata.buildCommands) buildCommands.add(item);
		for (const item of metadata.entryPoints) entryPoints.add(item);
	}

	return {
		root: absoluteRoot,
		technology: [...technology].sort(),
		entryPoints: [...entryPoints].sort(),
		modules: detectModules(scan.directories),
		testFrameworks: [...testFrameworks].sort(),
		buildCommands: [...buildCommands].sort(),
		manifests: manifests.sort(),
		structure: [
			...scan.directories.map((path) => `${path}/`),
			...scan.files,
		].sort(),
		truncated: scan.truncated,
	};
}

async function scanRepository(root: string, maxDepth: number, signal?: AbortSignal): Promise<ScanResult> {
	const files: string[] = [];
	const directories: string[] = [];
	let truncated = false;

	const visit = async (directory: string, depth: number): Promise<void> => {
		if (signal?.aborted) throw signal.reason;
		if (files.length + directories.length >= maxEntries) {
			truncated = true;
			return;
		}
		let entries: Dirent<string>[];
		try {
			entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
				left.name.localeCompare(right.name),
			);
		} catch (error) {
			if (isFileSystemError(error) && (error.code === "EACCES" || error.code === "EPERM")) {
				truncated = true;
				return;
			}
			throw error;
		}
		for (const entry of entries) {
			if (signal?.aborted) throw signal.reason;
			if (files.length + directories.length >= maxEntries) {
				truncated = true;
				return;
			}
			if (entry.isSymbolicLink() || (entry.isDirectory() && ignoredDirectories.has(entry.name))) continue;
			const absolutePath = join(directory, entry.name);
			const projectPath = normalizePath(relative(root, absolutePath));
			if (entry.isDirectory()) {
				directories.push(projectPath);
				if (depth < maxDepth) await visit(absolutePath, depth + 1);
			} else if (entry.isFile()) {
				files.push(projectPath);
			}
		}
	};

	await visit(root, 0);
	return { files, directories, truncated };
}

function detectFromFiles(
	files: string[],
	manifests: string[],
	technology: Set<string>,
	testFrameworks: Set<string>,
	buildCommands: Set<string>,
): void {
	const extensions = new Set(files.map((path) => extname(path).toLowerCase()));
	if ([".ts", ".tsx", ".mts", ".cts"].some((extension) => extensions.has(extension))) technology.add("TypeScript");
	if ([".js", ".jsx", ".mjs", ".cjs"].some((extension) => extensions.has(extension))) technology.add("JavaScript");
	if (extensions.has(".py")) technology.add("Python");
	if (extensions.has(".go")) technology.add("Go");
	if (extensions.has(".rs")) technology.add("Rust");
	if (extensions.has(".java") || extensions.has(".kt")) technology.add("JVM");
	if (extensions.has(".dart")) technology.add("Dart");

	const names = new Set(manifests.map((path) => basename(path)));
	if (names.has("Cargo.toml")) buildCommands.add("cargo build");
	if (names.has("go.mod")) buildCommands.add("go build ./...");
	if (names.has("pom.xml")) buildCommands.add("mvn test");
	if (names.has("build.gradle") || names.has("build.gradle.kts")) buildCommands.add("./gradlew build");
	if (files.some((path) => /(^|\/)pytest\.ini$|(^|\/)conftest\.py$/i.test(path))) testFrameworks.add("Pytest");
	if (files.some((path) => /(^|\/)vitest\.config\.[cm]?[jt]s$/i.test(path))) testFrameworks.add("Vitest");
	if (files.some((path) => /(^|\/)jest\.config\.[cm]?[jt]s$/i.test(path))) testFrameworks.add("Jest");
	if (files.some((path) => /(^|\/)playwright\.config\.[cm]?[jt]s$/i.test(path))) testFrameworks.add("Playwright");
}

async function readPackageMetadata(root: string, packagePath: string): Promise<{
	technology: string[];
	testFrameworks: string[];
	buildCommands: string[];
	entryPoints: string[];
}> {
	const empty = { technology: [], testFrameworks: [], buildCommands: [], entryPoints: [] };
	try {
		const raw: unknown = JSON.parse(await readFile(join(root, packagePath), "utf8"));
		if (!isRecord(raw)) return empty;
		const dependencies = new Set([
			...recordKeys(raw.dependencies),
			...recordKeys(raw.devDependencies),
			...recordKeys(raw.peerDependencies),
		]);
		const technology = new Set<string>();
		const testFrameworks = new Set<string>();
		for (const [dependency, label] of [
			["typescript", "TypeScript"],
			["react", "React"],
			["next", "Next.js"],
			["vue", "Vue"],
			["svelte", "Svelte"],
			["express", "Express"],
			["@nestjs/core", "NestJS"],
			["flutter", "Flutter"],
		] as const) {
			if (dependencies.has(dependency)) technology.add(label);
		}
		for (const [dependency, label] of [
			["vitest", "Vitest"],
			["jest", "Jest"],
			["@playwright/test", "Playwright"],
			["cypress", "Cypress"],
			["mocha", "Mocha"],
		] as const) {
			if (dependencies.has(dependency)) testFrameworks.add(label);
		}

		const prefix = normalizePath(relative(root, join(root, packagePath, "..")));
		const entryPoints = [raw.main, raw.module]
			.filter((value): value is string => typeof value === "string")
			.map((value) => normalizePath(join(prefix === "." ? "" : prefix, value)));
		if (typeof raw.bin === "string") entryPoints.push(normalizePath(join(prefix === "." ? "" : prefix, raw.bin)));
		if (isRecord(raw.bin)) {
			for (const value of Object.values(raw.bin)) {
				if (typeof value === "string") entryPoints.push(normalizePath(join(prefix === "." ? "" : prefix, value)));
			}
		}
		const buildCommands: string[] = [];
		if (isRecord(raw.scripts)) {
			for (const name of ["build", "test", "check", "lint", "dev"]) {
				if (typeof raw.scripts[name] === "string") buildCommands.push(`npm run ${name}`);
			}
		}
		return { technology: [...technology], testFrameworks: [...testFrameworks], buildCommands, entryPoints };
	} catch {
		return empty;
	}
}

function detectModules(directories: string[]): string[] {
	const modules = new Set<string>();
	for (const directory of directories) {
		const parts = directory.split("/");
		if (parts.length === 1 && !ignoredDirectories.has(parts[0])) modules.add(parts[0]);
		if (parts.length === 2 && ["app", "lib", "packages", "src"].includes(parts[0])) modules.add(directory);
	}
	return [...modules].sort().slice(0, 60);
}

function recordKeys(value: unknown): string[] {
	return isRecord(value) ? Object.keys(value) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileSystemError(value: unknown): value is Error & { code: string } {
	return value instanceof Error && "code" in value && typeof value.code === "string";
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}

export default function repoMapExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "repo_map",
		label: "Repo Map",
		description: "Scan the current repository and return its structure, technology stack, entry points, modules, tests, and build commands.",
		promptSnippet: "Build a structured map of the current repository",
		promptGuidelines: ["Use repo_map before broad work in an unfamiliar repository."],
		parameters: Type.Object({
			maxDepth: Type.Optional(
				Type.Integer({ minimum: 1, maximum: 6, description: "Maximum directory depth to scan (default: 3)" }),
			),
		}),
		executionMode: "parallel",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const map = await buildRepoMap(ctx.cwd, params.maxDepth ?? 3, signal);
			return {
				content: [{ type: "text", text: JSON.stringify(map, undefined, 2) }],
				details: map,
			};
		},
	});
}
