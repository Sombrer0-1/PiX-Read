/**
 * pdfjs-dist 预置资源（CMap / 标准字体数据）目录解析。
 *
 * CJK 字体的编码映射与未嵌入的标准字体都需要这些预置数据；缺省时 pdf.js 无法解码
 * 对应字形（表现为页面局部空白）且 getTextContent 输出乱码或空串。
 *
 * 开发态资源位于 node_modules/pdfjs-dist；electron-builder 会把生产依赖打进
 * app.asar，Electron 的 fs 补丁允许直接按路径读取 asar 内文件，两种形态共用解析。
 */

import { existsSync } from "fs";
import { join } from "path";
import { app } from "electron";

function resolvePdfjsDistSubdir(subdir: string): string | null {
	const appPath = app.getAppPath();
	const candidates = [
		join(appPath, "node_modules", "pdfjs-dist", subdir),
		// two-package.json 结构下依赖可能落在上一层目录
		join(appPath, "..", "node_modules", "pdfjs-dist", subdir),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

export function getPdfjsCMapsDir(): string | null {
	return resolvePdfjsDistSubdir("cmaps");
}

export function getPdfjsStandardFontsDir(): string | null {
	return resolvePdfjsDistSubdir("standard_fonts");
}

/** pdf.js 对 baseUrl 只做字符串拼接（baseUrl + 文件名），必须带尾部路径分隔符。 */
export function toPdfjsBaseUrl(dir: string): string {
	if (dir.endsWith("/") || dir.endsWith("\\")) return dir;
	return dir + (process.platform === "win32" ? "\\" : "/");
}
