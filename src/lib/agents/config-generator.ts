import { stringify } from "yaml";
import { randomBytes } from "crypto";

export interface AgentConfig {
  // Agent / LLM
  provider: string;
  apiKey: string;
  model: string;
  utilityModel?: string;
  maxTokens?: number;
  temperature?: number;

  // Telegram
  telegramApiId: number;
  telegramApiHash: string;
  telegramPhone: string;
  adminIds: number[];
  dmPolicy?: string;
  groupPolicy?: string;
  requireMention?: boolean;
  debouncMs?: number;
  botToken?: string;
  ownerName?: string;
  ownerUsername?: string;

  // Optional
  tavilyApiKey?: string;
  tonapiKey?: string;
  webuiEnabled?: boolean;
  webuiPort?: number;
  webuiAuthToken?: string;
}

/**
 * Generate config and return both the YAML string and the generated auth token.
 */
export function generateConfigWithToken(config: AgentConfig): { yaml: string; authToken: string } {
  const authToken = config.webuiAuthToken || randomBytes(24).toString("hex");
  const yaml = generateConfigYaml({ ...config, webuiAuthToken: authToken });
  return { yaml, authToken };
}

export function generateConfigYaml(config: AgentConfig): string {
  const yamlObj: Record<string, unknown> = {
    agent: {
      provider: config.provider,
      api_key: config.apiKey,
      model: config.model,
      ...(config.utilityModel && { utility_model: config.utilityModel }),
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      max_agentic_iterations: 5,
    },
    telegram: {
      api_id: config.telegramApiId,
      api_hash: config.telegramApiHash,
      phone: config.telegramPhone,
      session_name: "teleton_session",
      admin_ids: config.adminIds,
      dm_policy: config.dmPolicy ?? "pairing",
      group_policy: config.groupPolicy ?? "open",
      require_mention: config.requireMention ?? true,
      debounce_ms: config.debouncMs ?? 1500,
      ...(config.botToken && { bot_token: config.botToken }),
      ...(config.ownerName && { owner_name: config.ownerName }),
      ...(config.ownerUsername && { owner_username: config.ownerUsername }),
    },
    embedding: {
      provider: "local",
    },
    webui: {
      enabled: config.webuiEnabled ?? true,
      port: config.webuiPort ?? 7777,
      host: "0.0.0.0",
      auth_token: config.webuiAuthToken || randomBytes(24).toString("hex"),
    },
  };

  if (config.tavilyApiKey) {
    (yamlObj.agent as Record<string, unknown>).tavily_api_key =
      config.tavilyApiKey;
  }
  if (config.tonapiKey) {
    (yamlObj.agent as Record<string, unknown>).tonapi_key = config.tonapiKey;
  }

  return stringify(yamlObj);
}
