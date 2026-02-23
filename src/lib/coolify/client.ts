export class CoolifyApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string,
  ) {
    super(`Coolify API error ${statusCode}: ${body}`);
    this.name = "CoolifyApiError";
  }
}

export interface CreateDockerImageAppParams {
  name: string;
  docker_registry_image_name: string;
  docker_registry_image_tag?: string;
  ports_exposes: string;
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  domains?: string;
  instant_deploy?: boolean;
  custom_docker_run_options?: string;
  limits_memory?: string;
  limits_cpus?: string;
}

export interface CreateDockerComposeAppParams {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  docker_compose_raw: string;
  name?: string;
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

export interface CoolifyApp {
  uuid: string;
  name: string;
  status: string;
  fqdn?: string;
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

  // === Applications ===

  async createDockerImageApp(
    params: CreateDockerImageAppParams,
  ): Promise<{ uuid: string }> {
    return this.request("POST", "/applications/dockerimage", params);
  }

  async createDockerComposeApp(
    params: CreateDockerComposeAppParams,
  ): Promise<{ uuid: string }> {
    return this.request("POST", "/applications/dockercompose", params);
  }

  async getApp(uuid: string): Promise<CoolifyApp> {
    return this.request("GET", `/applications/${uuid}`);
  }

  async updateApp(
    uuid: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.request("PATCH", `/applications/${uuid}`, params);
  }

  async deleteApp(uuid: string): Promise<void> {
    await this.request("DELETE", `/applications/${uuid}`);
  }

  // === Lifecycle ===

  async deployApp(uuid: string, force?: boolean): Promise<void> {
    const query = force ? "?force=true" : "";
    await this.request("POST", `/applications/${uuid}/start${query}`);
  }

  async startApp(uuid: string): Promise<void> {
    await this.request("POST", `/applications/${uuid}/start`);
  }

  async stopApp(uuid: string): Promise<void> {
    await this.request("POST", `/applications/${uuid}/stop`);
  }

  async restartApp(uuid: string): Promise<void> {
    await this.request("POST", `/applications/${uuid}/restart`);
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

  // === Logs ===

  async getAppLogs(
    uuid: string,
    opts?: { since?: number; tail?: number },
  ): Promise<string> {
    const params = new URLSearchParams();
    if (opts?.since) params.set("since", String(opts.since));
    if (opts?.tail) params.set("tail", String(opts.tail));
    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await this.request<unknown>("GET", `/applications/${uuid}/logs${query}`);
    if (typeof result === "string") return result;
    if (typeof result === "object" && result !== null) {
      const obj = result as Record<string, unknown>;
      if (typeof obj.logs === "string") return obj.logs;
      if (Array.isArray(obj.logs)) return obj.logs.join("\n");
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  }

  // === Deployments ===

  async getDeployments(
    uuid: string,
  ): Promise<Array<{ id: number; deployment_uuid: string; status: string; created_at: string }>> {
    const result = await this.request<unknown>("GET", `/applications/${uuid}/deployments`);
    if (Array.isArray(result)) return result;
    if (typeof result === "object" && result !== null) {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.data)) return obj.data;
      if (Array.isArray(obj.deployments)) return obj.deployments;
    }
    return [];
  }

  async getDeploymentLogs(
    uuid: string,
    deploymentUuid: string,
  ): Promise<string> {
    const result = await this.request<unknown>(
      "GET",
      `/applications/${uuid}/deployments/${deploymentUuid}`,
    );
    if (typeof result === "string") return result;
    if (typeof result === "object" && result !== null) {
      const obj = result as Record<string, unknown>;
      if (typeof obj.logs === "string") return obj.logs;
      if (Array.isArray(obj.logs)) return obj.logs.join("\n");
      if (typeof obj.log === "string") return obj.log;
      if (typeof obj.output === "string") return obj.output;
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  }

  // === Health Check ===

  async checkHealth(): Promise<boolean> {
    try {
      // Health endpoint is at /api/health (no /v1 prefix)
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
