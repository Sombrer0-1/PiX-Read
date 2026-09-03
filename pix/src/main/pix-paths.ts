/**
 * PiX-Read 自有存储位置（唯一来源）。其它主进程模块一律从这里取路径，不再各自拼接。
 *
 * %APPDATA%/PiX-Read/                       pixRootDir            Electron userData
 *   pix-settings.json                       pixGuiSettingsFile    GUI 设置（electron-store）
 *   logs/                                   pixLogsDir
 *   agent/                                  pixAgentDir           交给 pi 内核的唯一目录
 *     settings.json                         pixKernelSettingsFile pi 内核设置
 *     auth.json / models.json / mcp.json    密钥 / 模型 / MCP 服务器
 *     SYSTEM.md / APPEND_SYSTEM.md          可选：覆盖 pi 默认系统提示词
 *     skills/ prompts/ extensions/          可选：PiX 自有资源
 *     sessions/<编码后的项目路径>/*.jsonl    会话历史
 *
 * 所有路径都从 appData 派生：不使用 homedir()，也不读写 pi CLI 的 ~/.pi/。
 */
import { app } from "electron";
import { mkdirSync } from "fs";
import { join } from "path";

export const pixRootDir = join(app.getPath("appData"), "PiX-Read");
export const pixGuiSettingsFile = join(pixRootDir, "pix-settings.json");
export const pixLogsDir = join(pixRootDir, "logs");

export const pixAgentDir = join(pixRootDir, "agent");
export const pixKernelSettingsFile = join(pixAgentDir, "settings.json");
export const pixAuthJsonFile = join(pixAgentDir, "auth.json");
export const pixModelsJsonFile = join(pixAgentDir, "models.json");
export const pixMcpJsonFile = join(pixAgentDir, "mcp.json");
export const pixSystemPromptFile = join(pixAgentDir, "SYSTEM.md");
export const pixAppendSystemPromptFile = join(pixAgentDir, "APPEND_SYSTEM.md");
export const pixAgentSkillsDir = join(pixAgentDir, "skills");
export const pixAgentPromptsDir = join(pixAgentDir, "prompts");
export const pixAgentExtensionsDir = join(pixAgentDir, "extensions");

export const pixSessionsRootDir = join(pixAgentDir, "sessions");

/** Electron 自身的缓存/日志位置也固定在 PiX 目录，dev 与打包版本共用一份数据。 */
export function pinPixUserData(): void {
	app.setPath("userData", pixRootDir);
	app.setPath("logs", pixLogsDir);
}

export function ensurePixDirectories(): void {
	mkdirSync(pixAgentDir, { recursive: true });
}

/**
 * 与 pi 内核 getDefaultSessionDirPath() 相同的编码，保证已有会话目录继续可读。
 * 内核没有导出该函数，所以这里复制其规则：去掉开头的路径分隔符，把 / \ : 换成 -。
 */
export function encodeProjectSessionDirName(cwd: string): string {
	return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

/** 某个项目的会话目录：<agentDir>/sessions/<编码后的项目路径>，不存在则创建。 */
export function pixProjectSessionsDir(cwd: string): string {
	const dir = join(pixSessionsRootDir, encodeProjectSessionDirName(cwd));
	mkdirSync(dir, { recursive: true });
	return dir;
}

export interface PixStoragePaths {
	rootDir: string;
	agentDir: string;
	guiSettingsFile: string;
	kernelSettingsFile: string;
	authJsonFile: string;
	modelsJsonFile: string;
	mcpJsonFile: string;
	sessionsRootDir: string;
	logsDir: string;
}

export function getPixStoragePaths(): PixStoragePaths {
	return {
		rootDir: pixRootDir,
		agentDir: pixAgentDir,
		guiSettingsFile: pixGuiSettingsFile,
		kernelSettingsFile: pixKernelSettingsFile,
		authJsonFile: pixAuthJsonFile,
		modelsJsonFile: pixModelsJsonFile,
		mcpJsonFile: pixMcpJsonFile,
		sessionsRootDir: pixSessionsRootDir,
		logsDir: pixLogsDir,
	};
}

/**
 * pi 在 auth.json 缺失某提供商的密钥时会回退到 shell 环境变量，这与用户的 pi CLI
 * 共用凭据，属于要解耦的隐式配置。PiX 默认把这些变量从自身进程中清掉；
 * 原始值先缓存，将来若提供“允许使用环境变量密钥”开关可以直接还原。
 */
const AMBIENT_CREDENTIAL_ENV_VARS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_OAUTH_TOKEN",
	"OPENAI_API_KEY",
	"AZURE_OPENAI_API_KEY",
	"DEEPSEEK_API_KEY",
	"GEMINI_API_KEY",
	"GOOGLE_CLOUD_API_KEY",
	"GOOGLE_APPLICATION_CREDENTIALS",
	"GOOGLE_CLOUD_PROJECT",
	"GCLOUD_PROJECT",
	"GOOGLE_CLOUD_LOCATION",
	"GROQ_API_KEY",
	"CEREBRAS_API_KEY",
	"XAI_API_KEY",
	"OPENROUTER_API_KEY",
	"AI_GATEWAY_API_KEY",
	"ZAI_API_KEY",
	"MISTRAL_API_KEY",
	"MINIMAX_API_KEY",
	"MINIMAX_CN_API_KEY",
	"MOONSHOT_API_KEY",
	"HF_TOKEN",
	"FIREWORKS_API_KEY",
	"TOGETHER_API_KEY",
	"OPENCODE_API_KEY",
	"KIMI_API_KEY",
	"CLOUDFLARE_API_KEY",
	"XIAOMI_API_KEY",
	"XIAOMI_TOKEN_PLAN_CN_API_KEY",
	"XIAOMI_TOKEN_PLAN_AMS_API_KEY",
	"XIAOMI_TOKEN_PLAN_SGP_API_KEY",
	"COPILOT_GITHUB_TOKEN",
	"AWS_PROFILE",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
	"AWS_BEARER_TOKEN_BEDROCK",
	"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
	"AWS_CONTAINER_CREDENTIALS_FULL_URI",
	"AWS_WEB_IDENTITY_TOKEN_FILE",
];

const capturedAmbientCredentials = new Map<string, string>();

export function captureAmbientCredentials(): void {
	if (capturedAmbientCredentials.size > 0) return;
	for (const name of AMBIENT_CREDENTIAL_ENV_VARS) {
		const value = process.env[name];
		if (value) capturedAmbientCredentials.set(name, value);
	}
}

/** allow=false：密钥只能在 PiX 内填写；allow=true：还原启动前的环境变量。 */
export function applyAmbientCredentialPolicy(allow: boolean): void {
	if (allow) {
		for (const [name, value] of capturedAmbientCredentials) {
			process.env[name] = value;
		}
		return;
	}
	for (const name of AMBIENT_CREDENTIAL_ENV_VARS) {
		delete process.env[name];
	}
}
