import { existsSync, readFileSync, realpathSync, statSync } from "fs";
import { isAbsolute, relative, resolve } from "path";
import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Type } from "typebox";
import { isLibraryFilePath } from "./library-root.js";

const MAX_PAGES_PER_CALL = 20;

interface PdfOutlineNode {
	title: string;
	page: number | null;
	items: PdfOutlineNode[];
}

function normalizeFsPath(targetPath: string): string {
	const resolved = resolve(targetPath);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInsideRoot(candidatePath: string, rootPath: string): boolean {
	const resolved = normalizeFsPath(candidatePath);
	const root = normalizeFsPath(rootPath);
	const relativePath = relative(root, resolved);
	if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
		return false;
	}
	try {
		const real = normalizeFsPath(realpathSync(candidatePath));
		if (real !== resolved) {
			const realRel = relative(root, real);
			if (realRel === "" || realRel.startsWith("..") || isAbsolute(realRel)) return false;
		}
	} catch {
		// Missing files fail later; only in-root resolved paths are allowed.
	}
	return true;
}

function isAllowedPdfPath(candidatePath: string, cwd: string): boolean {
	return isLibraryFilePath(candidatePath) || isInsideRoot(candidatePath, cwd);
}

function resolveGuardedPdfPath(filePath: string, cwd: string): { path: string } | { error: string } {
	const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
	if (!isAllowedPdfPath(resolved, cwd)) {
		return { error: "Path is outside the current library / session directory." };
	}
	if (!existsSync(resolved) || !statSync(resolved).isFile()) {
		return { error: `File not found: ${resolved}` };
	}
	return { path: resolved };
}

function extractPageText(items: unknown[]): string {
	let out = "";
	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const rec = item as { str?: unknown; hasEOL?: unknown };
		if (typeof rec.str !== "string") continue;
		out += rec.str;
		out += rec.hasEOL === true ? "\n" : " ";
	}
	return out.replace(/[ \t]+\n/g, "\n").replace(/ +/g, " ").trim();
}

function isRefProxy(value: unknown): value is { num: number; gen: number } {
	return !!value && typeof value === "object" && typeof (value as { num?: unknown }).num === "number";
}

async function convertOutline(doc: PDFDocumentProxy, nodes: unknown[]): Promise<PdfOutlineNode[]> {
	const result: PdfOutlineNode[] = [];
	for (const node of nodes) {
		if (!node || typeof node !== "object") continue;
		const raw = node as { title?: unknown; dest?: unknown; items?: unknown };
		const title = typeof raw.title === "string" ? raw.title : "";
		let page: number | null = null;
		try {
			const destArray =
				typeof raw.dest === "string" ? await doc.getDestination(raw.dest) : Array.isArray(raw.dest) ? raw.dest : null;
			const ref = destArray?.[0];
			if (isRefProxy(ref)) {
				page = (await doc.getPageIndex(ref)) + 1;
			}
		} catch {
			page = null;
		}
		const childItems = Array.isArray(raw.items) ? await convertOutline(doc, raw.items) : [];
		result.push({ title, page, items: childItems });
	}
	return result;
}

async function withPdfDocument<T>(filePath: string, fn: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
	const file = readFileSync(filePath);
	const data = new Uint8Array(file.byteLength);
	data.set(file);
	const task = getDocument({
		data,
		disableAutoFetch: true,
		disableStream: true,
		isEvalSupported: false,
		useSystemFonts: true,
		verbosity: 0,
	});
	const doc = await task.promise;
	try {
		return await fn(doc);
	} finally {
		await doc.destroy();
	}
}

function normalizePageNumbers(pages: number[]): number[] {
	const unique = new Set<number>();
	for (const raw of pages) {
		if (!Number.isFinite(raw)) continue;
		const page = Math.round(raw);
		if (page >= 1) unique.add(page);
	}
	return [...unique].sort((a, b) => a - b);
}

const pdfReadPagesTool = defineTool({
	name: "pdf_read_pages",
	label: "PDF read pages",
	description:
		"Extract text from specific 1-based PDF pages. Use this instead of read for PDF files. Prefer the current page and neighbors; do not dump the whole document.",
	promptSnippet: "Extract text from selected PDF pages",
	promptGuidelines: [
		"Use pdf_read_pages for PDFs instead of read.",
		"Prefer the current page and neighboring pages; do not dump the whole PDF.",
	],
	parameters: Type.Object({
		path: Type.String({ description: "Path to the PDF file (relative or absolute)" }),
		pages: Type.Array(Type.Number({ minimum: 1 }), {
			description: "1-based page numbers to extract",
			minItems: 1,
		}),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const guarded = resolveGuardedPdfPath(params.path, ctx.cwd);
		if ("error" in guarded) {
			return { content: [{ type: "text" as const, text: guarded.error }], details: { error: guarded.error } };
		}

		const requested = normalizePageNumbers(params.pages);
		if (requested.length === 0) {
			return {
				content: [{ type: "text" as const, text: "No valid 1-based page numbers were provided." }],
				details: { error: "invalid_pages" },
			};
		}
		if (requested.length > MAX_PAGES_PER_CALL) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Too many pages requested (${requested.length}). Limit is ${MAX_PAGES_PER_CALL} per call.`,
					},
				],
				details: { error: "too_many_pages" },
			};
		}

		try {
			const text = await withPdfDocument(guarded.path, async (doc) => {
				const parts: string[] = [`PDF: ${guarded.path}`, `Pages: ${doc.numPages}`];
				for (const pageNumber of requested) {
					if (pageNumber > doc.numPages) {
						parts.push(`\n--- page ${pageNumber} ---\n(page out of range)`);
						continue;
					}
					const page = await doc.getPage(pageNumber);
					const content = await page.getTextContent();
					const pageText = extractPageText(content.items);
					parts.push(`\n--- page ${pageNumber} ---\n${pageText || "(no extractable text)"}`);
				}
				return parts.join("\n");
			});
			return { content: [{ type: "text" as const, text }], details: { path: guarded.path, pages: requested } };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text" as const, text: `Failed to read PDF pages: ${message}` }],
				details: { error: message },
			};
		}
	},
});

const pdfOutlineTool = defineTool({
	name: "pdf_outline",
	label: "PDF outline",
	description: "Read PDF bookmarks/outline with 1-based page numbers. Use this instead of read for PDF structure.",
	promptSnippet: "Read PDF bookmarks and page numbers",
	promptGuidelines: ["Use pdf_outline for PDF bookmarks instead of parsing the file as text."],
	parameters: Type.Object({
		path: Type.String({ description: "Path to the PDF file (relative or absolute)" }),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const guarded = resolveGuardedPdfPath(params.path, ctx.cwd);
		if ("error" in guarded) {
			return { content: [{ type: "text" as const, text: guarded.error }], details: { error: guarded.error } };
		}

		try {
			const outline = await withPdfDocument(guarded.path, async (doc) => {
				const raw = await doc.getOutline();
				return raw?.length ? await convertOutline(doc, raw) : [];
			});
			const text =
				outline.length === 0
					? `PDF: ${guarded.path}\n(no outline)`
					: `PDF: ${guarded.path}\n${JSON.stringify(outline, null, 2)}`;
			return {
				content: [{ type: "text" as const, text }],
				details: { path: guarded.path, itemCount: outline.length },
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text" as const, text: `Failed to read PDF outline: ${message}` }],
				details: { error: message },
			};
		}
	},
});

export function createPdfToolsFactory(): ExtensionFactory {
	return (pi) => {
		pi.registerTool(pdfReadPagesTool);
		pi.registerTool(pdfOutlineTool);
	};
}
