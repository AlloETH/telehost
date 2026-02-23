export class CoolifyApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
  ) {
    super(`Coolify API error ${statusCode}: ${body}`);
    this.name = "CoolifyApiError";
  }
}

export interface CreateServiceParams {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  docker_compose_raw: string;
  name?: string;
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

export interface CoolifyServiceApplication {
  uuid: string;
  name: string;
  status: string;
  fqdn?: string;
  [key: string]: unknown;
}

export interface CoolifyService {
  uuid: string;
  name: string;
  status: string;
  fqdn?: string;
  applications?: CoolifyServiceApplication[];
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

  // === Services (Docker Compose) ===

  async createService(
    params: CreateServiceParams,
  ): Promise<{ uuid: string }> {
    return this.request("POST", "/services", params);
  }

  async getService(uuid: string): Promise<CoolifyService> {
    return this.request("GET", `/services/${uuid}`);
  }

  async updateService(
    uuid: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.request("PATCH", `/services/${uuid}`, params);
  }

  async deleteService(uuid: string): Promise<void> {
    await this.request("DELETE", `/services/${uuid}`);
  }

  // === Lifecycle ===

  async deployService(uuid: string): Promise<void> {
    await this.request("POST", `/services/${uuid}/start`);
  }

  async stopService(uuid: string): Promise<void> {
    await this.request("POST", `/services/${uuid}/stop`);
  }

  async restartService(uuid: string): Promise<void> {
    await this.request("POST", `/services/${uuid}/restart`);
  }

  // === Environment Variables ===

  async setServiceEnvVar(uuid: string, envVar: EnvVar): Promise<void> {
    await this.request("POST", `/services/${uuid}/envs`, envVar);
  }

  async bulkSetServiceEnvVars(uuid: string, envVars: EnvVar[]): Promise<void> {
    await this.request("PATCH", `/services/${uuid}/envs/bulk`, {
      data: envVars,
    });
  }

  // === Logs ===

  async getApplicationLogs(
    appUuid: string,
    lines: number = 100,
  ): Promise<string> {
    try {
      const data = await this.request<unknown>(
        "GET",
        `/applications/${appUuid}/logs?lines=${lines}`,
      );
      if (Array.isArray(data)) return data.join("\n");
      if (typeof data === "string") return data;
      return JSON.stringify(data);
    } catch (err) {
      if (err instanceof CoolifyApiError && err.statusCode === 404) {
        throw new Error("Logs endpoint not available for this resource");
      }
      throw err;
    }
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
