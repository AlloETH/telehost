import { randomBytes } from "crypto";

export interface OpenClawConfig {
  // LLM provider
  provider: string;
  apiKey: string;
  model: string;

  // Optional channel tokens
  telegramBotToken?: string;
  discordBotToken?: string;
  slackBotToken?: string;
  slackAppToken?: string;
}

/** Map our provider names to OpenClaw provider identifiers */
function mapProvider(provider: string): string {
  const mapping: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    xai: "xai",
    groq: "groq",
    openrouter: "openrouter",
  };
  return mapping[provider] || provider;
}

/** Map provider to the env var name OpenClaw uses for the API key */
export function providerEnvKey(provider: string): string {
  const mapping: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GEMINI_API_KEY",
    xai: "ZAI_API_KEY",
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return mapping[provider] || "OPENAI_API_KEY";
}

/**
 * Generate OpenClaw config JSON and a gateway token.
 */
export function generateOpenClawConfig(config: OpenClawConfig): {
  configJson: string;
  gatewayToken: string;
} {
  const gatewayToken = randomBytes(32).toString("hex");

  const openclawConfig: Record<string, unknown> = {
    models: {
      default: {
        provider: mapProvider(config.provider),
        model: config.model,
      },
    },
    gateway: {
      port: 18789,
      bind: "lan",
    },
    agents: {
      defaults: {
        sandbox: { mode: "off" },
      },
    },
  };

  // Channels — only include enabled ones
  const channels: Record<string, unknown> = {};

  if (config.telegramBotToken) {
    channels.telegram = {
      enabled: true,
      botToken: config.telegramBotToken,
    };
  }

  if (config.discordBotToken) {
    channels.discord = {
      enabled: true,
      botToken: config.discordBotToken,
    };
  }

  if (config.slackBotToken && config.slackAppToken) {
    channels.slack = {
      enabled: true,
      botToken: config.slackBotToken,
      appToken: config.slackAppToken,
    };
  }

  if (Object.keys(channels).length > 0) {
    openclawConfig.channels = channels;
  }

  return {
    configJson: JSON.stringify(openclawConfig, null, 2),
    gatewayToken,
  };
}
