import type { AgentState } from "@earendil-works/pi-agent-core";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { APP_NAME, getExportTemplateDir } from "../../config.ts";
import { normalizePath, resolvePath } from "../../utils/paths.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { SessionManager } from "../session-manager.ts";

/**
 * Static light color palette for HTML export (replaces the removed terminal theme system).
 */
const EXPORT_COLORS: Record<string, string> = {
	accent: "#0b57d0",
	border: "#d5dfe8",
	borderAccent: "#9db3c4",
	borderMuted: "#e3eaf0",
	success: "#2e7d4f",
	error: "#b3423d",
	warning: "#a8701f",
	muted: "#5f6b76",
	dim: "#8a959e",
	text: "#1f2933",
	thinkingText: "#5f6b76",
	selectedBg: "#e8f0fe",
	userMessageBg: "#eef3f8",
	userMessageText: "#1f2933",
	customMessageBg: "#f4f6f9",
	customMessageText: "#1f2933",
	customMessageLabel: "#52606d",
	toolPendingBg: "#f4f6f9",
	toolSuccessBg: "#edf7f1",
	toolErrorBg: "#faf0ef",
	toolTitle: "#1f2933",
	toolOutput: "#333d47",
	toolDiffAdded: "#e5f4ea",
	toolDiffRemoved: "#fce8e6",
	toolDiffContext: "#f4f6f9",
	mdHeading: "#1f2933",
	mdLink: "#0b57d0",
	mdCode: "#a85400",
	mdCodeBlockBorder: "#d5dfe8",
	mdHr: "#d5dfe8",
	mdListBullet: "#52606d",
	mdQuote: "#5f6b76",
	mdQuoteBorder: "#c4d0da",
	syntaxComment: "#8a959e",
	syntaxFunction: "#7c4dff",
	syntaxKeyword: "#0b57d0",
	syntaxNumber: "#a85400",
	syntaxOperator: "#52606d",
	syntaxPunctuation: "#52606d",
	syntaxString: "#2e7d4f",
	syntaxType: "#00838f",
	syntaxVariable: "#b3423d",
};

export interface ExportOptions {
	outputPath?: string;
}

/** Parse a color string to RGB values. Supports hex (#RRGGBB) and rgb(r,g,b) formats. */
function parseColor(color: string): { r: number; g: number; b: number } | undefined {
	const hexMatch = color.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
	if (hexMatch) {
		return {
			r: Number.parseInt(hexMatch[1], 16),
			g: Number.parseInt(hexMatch[2], 16),
			b: Number.parseInt(hexMatch[3], 16),
		};
	}
	const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
	if (rgbMatch) {
		return {
			r: Number.parseInt(rgbMatch[1], 10),
			g: Number.parseInt(rgbMatch[2], 10),
			b: Number.parseInt(rgbMatch[3], 10),
		};
	}
	return undefined;
}

/** Calculate relative luminance of a color (0-1, higher = lighter). */
function getLuminance(r: number, g: number, b: number): number {
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Adjust color brightness. Factor > 1 lightens, < 1 darkens. */
function adjustBrightness(color: string, factor: number): string {
	const parsed = parseColor(color);
	if (!parsed) return color;
	const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c * factor)));
	return `rgb(${adjust(parsed.r)}, ${adjust(parsed.g)}, ${adjust(parsed.b)})`;
}

/** Derive export background colors from a base color (e.g., userMessageBg). */
function deriveExportColors(baseColor: string): { pageBg: string; cardBg: string; infoBg: string } {
	const parsed = parseColor(baseColor);
	if (!parsed) {
		return {
			pageBg: "rgb(24, 24, 30)",
			cardBg: "rgb(30, 30, 36)",
			infoBg: "rgb(60, 55, 40)",
		};
	}

	const luminance = getLuminance(parsed.r, parsed.g, parsed.b);
	const isLight = luminance > 0.5;

	if (isLight) {
		return {
			pageBg: adjustBrightness(baseColor, 0.96),
			cardBg: baseColor,
			infoBg: `rgb(${Math.min(255, parsed.r + 10)}, ${Math.min(255, parsed.g + 5)}, ${Math.max(0, parsed.b - 20)})`,
		};
	}
	return {
		pageBg: adjustBrightness(baseColor, 0.7),
		cardBg: adjustBrightness(baseColor, 0.85),
		infoBg: `rgb(${Math.min(255, parsed.r + 20)}, ${Math.min(255, parsed.g + 15)}, ${parsed.b})`,
	};
}

/**
 * Generate CSS custom property declarations for the export palette.
 */
function generateThemeVars(): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(EXPORT_COLORS)) {
		lines.push(`--${key}: ${value};`);
	}

	const derivedColors = deriveExportColors(EXPORT_COLORS.userMessageBg || "#343541");
	lines.push(`--exportPageBg: ${derivedColors.pageBg};`);
	lines.push(`--exportCardBg: ${derivedColors.cardBg};`);
	lines.push(`--exportInfoBg: ${derivedColors.infoBg};`);

	return lines.join("\n      ");
}

interface SessionData {
	header: ReturnType<SessionManager["getHeader"]>;
	entries: ReturnType<SessionManager["getEntries"]>;
	leafId: string | null;
	systemPrompt?: string;
	tools?: Array<Pick<ToolDefinition, "name" | "description" | "parameters">>;
}

/**
 * Core HTML generation logic shared by both export functions.
 */
function generateHtml(sessionData: SessionData): string {
	const templateDir = getExportTemplateDir();
	const template = readFileSync(join(templateDir, "template.html"), "utf-8");
	const templateCss = readFileSync(join(templateDir, "template.css"), "utf-8");
	const templateJs = readFileSync(join(templateDir, "template.js"), "utf-8");
	const markedJs = readFileSync(join(templateDir, "vendor", "marked.min.js"), "utf-8");
	const hljsJs = readFileSync(join(templateDir, "vendor", "highlight.min.js"), "utf-8");

	const themeVars = generateThemeVars();
	const derivedExportColors = deriveExportColors(EXPORT_COLORS.userMessageBg || "#343541");
	const bodyBg = derivedExportColors.pageBg;
	const containerBg = derivedExportColors.cardBg;
	const infoBg = derivedExportColors.infoBg;

	// Base64 encode session data to avoid escaping issues
	const sessionDataBase64 = Buffer.from(JSON.stringify(sessionData)).toString("base64");

	// Build the CSS with theme variables injected
	const css = templateCss
		.replace("{{THEME_VARS}}", themeVars)
		.replace("{{BODY_BG}}", bodyBg)
		.replace("{{CONTAINER_BG}}", containerBg)
		.replace("{{INFO_BG}}", infoBg);

	return template
		.replace("{{CSS}}", css)
		.replace("{{JS}}", templateJs)
		.replace("{{SESSION_DATA}}", sessionDataBase64)
		.replace("{{MARKED_JS}}", markedJs)
		.replace("{{HIGHLIGHT_JS}}", hljsJs);
}

/**
 * Export session to HTML using SessionManager and AgentState.
 */
export async function exportSessionToHtml(
	sm: SessionManager,
	state?: AgentState,
	options?: ExportOptions | string,
): Promise<string> {
	const opts: ExportOptions = typeof options === "string" ? { outputPath: options } : options || {};

	const sessionFile = sm.getSessionFile();
	if (!sessionFile) {
		throw new Error("Cannot export in-memory session to HTML");
	}
	if (!existsSync(sessionFile)) {
		throw new Error("Nothing to export yet - start a conversation first");
	}

	const entries = sm.getEntries();

	const sessionData: SessionData = {
		header: sm.getHeader(),
		entries,
		leafId: sm.getLeafId(),
		systemPrompt: state?.systemPrompt,
		tools: state?.tools?.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
	};

	const html = generateHtml(sessionData);

	let outputPath = opts.outputPath ? normalizePath(opts.outputPath) : undefined;
	if (!outputPath) {
		const sessionBasename = basename(sessionFile, ".jsonl");
		outputPath = `${APP_NAME}-session-${sessionBasename}.html`;
	}

	writeFileSync(outputPath, html, "utf8");
	return outputPath;
}

/**
 * Export session file to HTML (standalone, without AgentState).
 * Used by CLI for exporting arbitrary session files.
 */
export async function exportFromFile(inputPath: string, options?: ExportOptions | string): Promise<string> {
	const opts: ExportOptions = typeof options === "string" ? { outputPath: options } : options || {};
	const resolvedInputPath = resolvePath(inputPath);

	if (!existsSync(resolvedInputPath)) {
		throw new Error(`File not found: ${resolvedInputPath}`);
	}

	const sm = SessionManager.open(resolvedInputPath);

	const sessionData: SessionData = {
		header: sm.getHeader(),
		entries: sm.getEntries(),
		leafId: sm.getLeafId(),
		systemPrompt: undefined,
		tools: undefined,
	};

	const html = generateHtml(sessionData);

	let outputPath = opts.outputPath ? normalizePath(opts.outputPath) : undefined;
	if (!outputPath) {
		const inputBasename = basename(resolvedInputPath, ".jsonl");
		outputPath = `${APP_NAME}-session-${inputBasename}.html`;
	}

	writeFileSync(outputPath, html, "utf8");
	return outputPath;
}
