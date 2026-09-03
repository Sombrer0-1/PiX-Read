/**
 * PiX-Read 进程级环境隔离。
 *
 * 必须保持为 main 入口的第一个 import：这些副作用在任何 @earendil-works 模块被
 * 求值之前运行，pi 内核里少数只认环境变量的代码路径（getAgentDir）因此落在
 * PiX 自己的目录，而不是与 pi CLI 共用的 ~/.pi/agent。
 * 正确性不依赖这个变量：所有 pi 调用点都显式传入 pix-paths 里的路径，这里只是兜底。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { app } from "electron";
import {
	applyAmbientCredentialPolicy,
	captureAmbientCredentials,
	ensurePixDirectories,
	pinPixUserData,
	pixAgentDir,
	pixGuiSettingsFile,
	pixRootDir,
} from "./pix-paths.js";

pinPixUserData();
ensurePixDirectories();
process.env.PI_CODING_AGENT_DIR = pixAgentDir;

// MCP 配置路径完全由 PiX 指定，避免用户 shell 里的 PI_MCP_CONFIG 注入额外文件。
delete process.env.PI_MCP_CONFIG;

// 默认不使用 shell 环境变量里的模型密钥，密钥只在 PiX 内配置。
captureAmbientCredentials();
applyAmbientCredentialPolicy(false);

/**
 * 一次性迁移（可日后删除）：早期 dev 构建把 GUI 设置写在 %APPDATA%/pix-read。
 * 那是 PiX 自己的数据（最近打开的项目等），所以搬到新的固定位置；源文件不删除。
 * 只跑一次：目标已存在、源不存在、或源与目标在大小写不敏感文件系统上是同一个文件时跳过。
 */
function migrateLegacyGuiSettings(): void {
	if (existsSync(pixGuiSettingsFile)) return;
	const legacyFile = join(app.getPath("appData"), "pix-read", "pix-settings.json");
	if (resolve(legacyFile).toLowerCase() === resolve(pixGuiSettingsFile).toLowerCase()) return;
	if (!existsSync(legacyFile)) return;
	try {
		JSON.parse(readFileSync(legacyFile, "utf-8"));
	} catch (err) {
		console.error(`[env-setup] Legacy settings file is not valid JSON, skipping migration: ${legacyFile}`, err);
		return;
	}
	mkdirSync(pixRootDir, { recursive: true });
	copyFileSync(legacyFile, pixGuiSettingsFile);
}

migrateLegacyGuiSettings();
