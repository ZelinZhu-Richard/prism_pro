import type { ApiProvider as Provider } from "../shared/types";

export const providerConfig: Record<
  Provider,
  { base: string; env: string; aliases?: string[] }
> = {
  openai: { base: "https://api.openai.com/v1", env: "OPENAI_API_KEY" },
  anthropic: { base: "https://api.anthropic.com/v1", env: "ANTHROPIC_API_KEY" },
  deepseek: { base: "https://api.deepseek.com", env: "DEEPSEEK_API_KEY" },
  gemini: {
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    env: "GEMINI_API_KEY",
    aliases: ["GOOGLE_API_KEY"],
  },
  qwen: {
    base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    env: "QWEN_API_KEY",
    aliases: ["DASHSCOPE_API_KEY"],
  },
};

export function environmentKey(
  provider: Provider,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = providerConfig[provider];
  return (
    [config.env, ...(config.aliases ?? [])]
      .map((name) => env[name]?.trim())
      .find(Boolean) ?? ""
  );
}

/** Accept only official Alibaba endpoints; never send credentials to a custom host. */
export function qwenBaseUrl(value: string) {
  const invalid = () =>
    new Error(
      "Use an official Alibaba Cloud HTTPS endpoint ending in /compatible-mode/v1.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  const legacy = [
    "dashscope-intl.aliyuncs.com",
    "dashscope.aliyuncs.com",
    "dashscope-us.aliyuncs.com",
    "cn-hongkong.dashscope.aliyuncs.com",
  ];
  const workspace =
    /^[a-z0-9][a-z0-9-]*\.(ap-southeast-1|us-east-1|cn-beijing|cn-hongkong|ap-northeast-1)\.maas\.aliyuncs\.com$/;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    (!legacy.includes(url.hostname) && !workspace.test(url.hostname)) ||
    !/^\/compatible-mode\/v1\/?$/.test(url.pathname)
  )
    throw invalid();
  return url.origin + "/compatible-mode/v1";
}

export function providerBaseUrl(
  provider: Provider,
  env: NodeJS.ProcessEnv = process.env,
) {
  return provider === "qwen"
    ? qwenBaseUrl(
        env.QWEN_BASE_URL?.trim() ||
          env.DASHSCOPE_BASE_URL?.trim() ||
          providerConfig.qwen.base,
      )
    : providerConfig[provider].base;
}
