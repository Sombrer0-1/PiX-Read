import { marked, type Renderer } from "marked";

marked.setOptions({ breaks: true, gfm: true });

export interface MarkdownRenderOptions {
	citationKeys?: ReadonlySet<string>;
	imageSources?: ReadonlyMap<string, string>;
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function createRenderer(options: MarkdownRenderOptions): Renderer {
	const renderer = new marked.Renderer();
	renderer.html = (html: string) => escapeHtml(html);
	// 复制按钮走 ChatPanel 的事件委托，不允许内联 onclick（renderer.html 已全量转义）。
	renderer.code = (code: string, infostring: string | undefined, escaped: boolean): string => {
		const lang = (infostring ?? "").match(/^\S*/)?.[0] ?? "";
		const normalized = `${code.replace(/\n$/, "")}\n`;
		const body = escaped ? normalized : escapeHtml(normalized);
		const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
		const langSpan = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
		return `<div class="code-block"><div class="code-block-bar">${langSpan}<button type="button" class="code-copy-btn">复制</button></div><pre><code${langClass}>${body}</code></pre></div>\n`;
	};
	renderer.link = (href: string, title: string | null | undefined, text: string): string => {
		const safeHref = sanitizeHref(href);
		if (!safeHref) return `<a href="#" rel="noopener noreferrer" data-unsafe-link="true">${text}</a>`;
		const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
		return `<a href="${escapeHtml(safeHref)}"${titleAttr} data-external-link="true" rel="noopener noreferrer">${text}</a>`;
	};
	renderer.image = (href: string, title: string | null, text: string): string => {
		const normalizedHref = normalizePath(href);
		const hrefName = normalizedHref.split("/").pop();
		const source = [...(options.imageSources?.entries() ?? [])].find(([path]) => {
			const normalizedPath = normalizePath(path);
			return normalizedPath === normalizedHref ||
				normalizedPath.endsWith(`/${normalizedHref}`) ||
				normalizedHref.endsWith(`/${normalizedPath}`) ||
				(hrefName !== undefined && normalizedPath.split("/").pop() === hrefName);
		})?.[1];
		if (!source) {
			const safeHref = sanitizeHref(href);
			if (!safeHref) return `<span class="missing-image">${escapeHtml(text || href)}</span>`;
			const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
			return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy">`;
		}
		const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
		return `<img src="${escapeHtml(source)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy">`;
	};
	return renderer;
}

function linkCitations(text: string, citationKeys: ReadonlySet<string> | undefined): string {
	if (!citationKeys || citationKeys.size === 0) return text;
	return text.replace(/\[@([A-Za-z0-9][A-Za-z0-9_.:-]*)\]/g, (match, key: string) => {
		if (!citationKeys.has(key)) return match;
		return `[${match}](#citation-${encodeURIComponent(key)})`;
	});
}

/** Agent 约定 [[p37]] 标注页码；转成内部锚点，由 ChatPanel 委托点击跳转。 */
function linkPageJumps(text: string): string {
	return text.replace(/\[\[p(\d{1,4})\]\]/g, (_match, page: string) => `[p.${page}](#pix-page-jump-${page})`);
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function sanitizeHref(href: string): string | null {
	const trimmed = href.trim();
	if (!trimmed) return null;
	if (/^[./#?]/.test(trimmed)) return trimmed;
	try {
		const url = new URL(trimmed);
		return ["http:", "https:", "mailto:"].includes(url.protocol) ? trimmed : null;
	} catch {
		return null;
	}
}

function stripTrailingWhitespace(html: string): string {
	return html
		.replace(/(<br\s*\/?\>)+\s*<\/p>/gi, "</p>")
		.replace(/<p>\s*(<br\s*\/?\>|\s|&nbsp;)*<\/p>\s*$/gi, "");
}

export function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): string {
	if (!text) return "&nbsp;";
	try {
		const result = marked.parse(linkPageJumps(linkCitations(text, options.citationKeys)), {
			async: false,
			renderer: createRenderer(options),
		});
		return typeof result === "string" ? stripTrailingWhitespace(result) : escapeHtml(text);
	} catch {
		return escapeHtml(text);
	}
}
