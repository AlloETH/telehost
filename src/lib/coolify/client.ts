export class CoolifyApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
  ) {
    super(`Coolify API error ${statusCode}: ${body}`);
    this.name = "CoolifyApiError";
  }
}

export interface CreateApplicationParams {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  docker_compose_raw: string;
  name: string;
  description?: string;
  instant_deploy?: boolean;
}

export interface EnvVar {
  key: string;
  value: string;
  is_build_time?: boolean;
  is_literal?: boolean;
  is_preview?: boolean;
  is_shown_once?: boolean;
}

export interface CoolifyApplication {
  uuid: string;
  name: string;
  status: string;
  fqdn?: string;
  docker_compose_raw?: string;
  docker_compose_domains?: string;
  [key: string]: unknown;
}

class CoolifyClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    const url = process.env.COOLIFY_API_URL;
    const token = process.env.COOLIFY_API_TOKEN;
    if (!url || !token) {
      throw new Error(
        "COOLIFY_API_URL and COOLIFY_API_TOKEN must be set",
      );
    }
    this.baseUrl = url.replace(/\/$/, "");
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new CoolifyApiError(res.status, text);
    }

    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return res.json();
    }
    return res.text() as unknown as T;
  }

  // === Applications (Docker Compose) ===

  async createApplication(
    params: CreateApplicationParams,
  ): Promise<{ uuid: string }> {
    return this.request("POST", "/applications/dockercompose", params);
  }

  async getApplication(uuid: string): Promise<CoolifyApplication> {
    return this.request("GET", `/applications/${uuid}`);
  }

  async updateApplication(
    uuid: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.request("PATCH", `/applications/${uuid}`, params);
  }

  async deleteApplication(uuid: string): Promise<void> {
    await this.request("DELETE", `/applications/${uuid}`);
  }

  // === Lifecycle ===

  async startApplication(uuid: string): Promise<void> {
    await this.request("GET", `/applications/${uuid}/start`);
  }

  async stopApplication(uuid: string): Promise<void> {
    await this.request("GET", `/applications/${uuid}/stop`);
  }

  async restartApplication(uuid: string): Promise<void> {
    await this.request("GET", `/applications/${uuid}/restart`);
  }

  // === Logs ===

  async getApplicationLogs(
    uuid: string,
    lines: number = 100,
  ): Promise<string> {
    const data = await this.request<{ logs?: string }>(
      "GET",
      `/applications/${uuid}/logs?lines=${lines}`,
    );
    if (typeof data === "string") return data;
    return data.logs || "";
  }

  // === Environment Variables ===

  async setEnvVar(uuid: string, envVar: EnvVar): Promise<void> {
    await this.request("POST", `/applications/${uuid}/envs`, envVar);
  }

  async bulkSetEnvVars(uuid: string, envVars: EnvVar[]): Promise<void> {
    await this.request("PATCH", `/applications/${uuid}/envs/bulk`, {
      data: envVars,
    });
  }

  // === Health Check ===

  async checkHealth(): Promise<boolean> {
    try {
      const healthUrl = this.baseUrl.replace("/api/v1", "/api/health");
      const res = await fetch(healthUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Singleton
let _client: CoolifyClient | null = null;

export function getCoolifyClient(): CoolifyClient {
  if (!_client) {
    _client = new CoolifyClient();
  }
  return _client;
}
