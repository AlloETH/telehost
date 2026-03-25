import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Inject, Res, Req,
  NotFoundException, BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";
import { agents } from "../db/schema";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { AgentsService } from "./agents.service";
import { CoolifyService, CoolifyApiError } from "../coolify/coolify.service";
import { CryptoService } from "../crypto/crypto.service";
import { z } from "zod";

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  telegramBotToken: z.string().optional(),
  discordBotToken: z.string().optional(),
  slackBotToken: z.string().optional(),
  slackAppToken: z.string().optional(),
});

@Controller("agents")
export class AgentsController {
  constructor(
    @Inject(DB) private db: Db,
    private agentsService: AgentsService,
    private coolify: CoolifyService,
    private crypto: CryptoService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const userAgents = await this.db
      .select({ id: agents.id, name: agents.name, slug: agents.slug, status: agents.status, coolifyAppUuid: agents.coolifyAppUuid, lastHealthCheck: agents.lastHealthCheck, lastError: agents.lastError, createdAt: agents.createdAt, updatedAt: agents.updatedAt })
      .from(agents).where(eq(agents.userId, user.userId)).orderBy(agents.createdAt);

    const synced = await Promise.all(userAgents.map(async (agent) => {
      try {
        const result = await Promise.race([this.agentsService.syncAgentStatus(agent), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
        if (result) return { ...agent, status: result.status };
      } catch {}
      return agent;
    }));

    return { agents: synced };
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ error: "Invalid input", details: parsed.error.flatten() });

    try {
      const agentId = await this.agentsService.createAgent(user.userId, parsed.data.name, {
        provider: parsed.data.provider, apiKey: parsed.data.apiKey, model: parsed.data.model,
        telegramBotToken: parsed.data.telegramBotToken, discordBotToken: parsed.data.discordBotToken,
        slackBotToken: parsed.data.slackBotToken, slackAppToken: parsed.data.slackAppToken,
      });
      return { agentId };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Unknown error");
    }
  }

  @Get("check-name")
  async checkName(@Query("name") name: string) {
    if (!name) throw new BadRequestException("Name is required");
    const slug = this.agentsService.nameToSlug(name);
    if (!slug) return { available: false, slug: "", reason: "Name must contain at least one letter or number" };
    const existing = await this.db.select({ id: agents.id }).from(agents).where(eq(agents.slug, slug)).limit(1);
    return { available: existing.length === 0, slug };
  }

  @Get(":agentId")
  async getOne(@Param("agentId") agentId: string, @CurrentUser() user: CurrentUserPayload) {
    const results = await this.db
      .select({ id: agents.id, name: agents.name, status: agents.status, coolifyAppUuid: agents.coolifyAppUuid, webuiAuthToken: agents.webuiAuthToken, lastHealthCheck: agents.lastHealthCheck, lastError: agents.lastError, restartCount: agents.restartCount, createdAt: agents.createdAt, updatedAt: agents.updatedAt, stoppedAt: agents.stoppedAt, trialEndsAt: agents.trialEndsAt, configEncrypted: agents.configEncrypted, configIv: agents.configIv, configTag: agents.configTag })
      .from(agents).where(and(eq(agents.id, agentId), eq(agents.userId, user.userId))).limit(1);

    if (results.length === 0) throw new NotFoundException("Agent not found");
    const { configEncrypted, configIv, configTag, ...agentFields } = results[0];
    const agent = { ...agentFields } as Record<string, unknown>;

    const synced = await this.agentsService.syncAgentStatus(agentFields as any);
    if (synced) { agent.status = synced.status; if (synced.health !== undefined) agent.healthStatus = synced.health; if (synced.errorDetail !== undefined) agent.lastError = synced.errorDetail; }

    try {
      const [tag, salt] = configTag.split(":");
      const configStr = this.crypto.decrypt({ ciphertext: configEncrypted, iv: configIv, tag, salt });
      const parsed = JSON.parse(configStr);
      agent.config = { provider: parsed.models?.default?.provider, apiKey: parsed._apiKey, model: parsed.models?.default?.model, telegramBotToken: parsed.channels?.telegram?.botToken, discordBotToken: parsed.channels?.discord?.botToken, slackBotToken: parsed.channels?.slack?.botToken, slackAppToken: parsed.channels?.slack?.appToken };
    } catch {}

    return { agent };
  }

  @Patch(":agentId")
  async update(@Param("agentId") agentId: string, @Body() body: any, @CurrentUser() user: CurrentUserPayload) {
    const existing = await this.db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.userId, user.userId))).limit(1);
    if (existing.length === 0) throw new NotFoundException("Agent not found");

    const agent = existing[0];
    const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
    let needsRedeploy = false;

    if (body.name && body.name !== agent.name) {
      const newSlug = this.agentsService.nameToSlug(body.name);
      if (!newSlug) throw new BadRequestException("Name must contain at least one letter or number");
      const slugExists = await this.db.select({ id: agents.id }).from(agents).where(eq(agents.slug, newSlug)).limit(1);
      if (slugExists.length > 0 && slugExists[0].id !== agentId) throw new BadRequestException(`Name "${body.name}" is already taken`);
      dbUpdates.name = body.name;
      dbUpdates.slug = newSlug;
      if (agent.coolifyAppUuid) {
        const baseDomain = process.env.AGENT_BASE_DOMAIN;
        await this.coolify.updateApplication(agent.coolifyAppUuid, { name: newSlug, ...(baseDomain ? { domains: `https://${newSlug}.${baseDomain}` } : {}) });
        needsRedeploy = true;
      }
    }

    const CONFIG_FIELDS = ["provider", "apiKey", "model", "telegramBotToken", "discordBotToken", "slackBotToken", "slackAppToken"];
    const hasConfigChanges = CONFIG_FIELDS.some((f) => body[f] !== undefined);

    if (hasConfigChanges) {
      const [tag, salt] = agent.configTag.split(":");
      const currentConfigStr = this.crypto.decrypt({ ciphertext: agent.configEncrypted, iv: agent.configIv, tag, salt });
      const currentConfig = JSON.parse(currentConfigStr);

      const newConfig = {
        provider: body.provider ?? currentConfig.models?.default?.provider ?? "",
        apiKey: body.apiKey ?? currentConfig._apiKey ?? "",
        model: body.model ?? currentConfig.models?.default?.model ?? "",
        telegramBotToken: body.telegramBotToken ?? currentConfig.channels?.telegram?.botToken,
        discordBotToken: body.discordBotToken ?? currentConfig.channels?.discord?.botToken,
        slackBotToken: body.slackBotToken ?? currentConfig.channels?.slack?.botToken,
        slackAppToken: body.slackAppToken ?? currentConfig.channels?.slack?.appToken,
      };

      const { configJson } = this.agentsService.generateOpenClawConfig(newConfig);
      const configWithKey = JSON.parse(configJson);
      configWithKey._apiKey = newConfig.apiKey;
      const encrypted = this.crypto.encrypt(JSON.stringify(configWithKey, null, 2));

      dbUpdates.configEncrypted = encrypted.ciphertext;
      dbUpdates.configIv = encrypted.iv;
      dbUpdates.configTag = encrypted.tag + ":" + encrypted.salt;
      if (agent.coolifyAppUuid) needsRedeploy = true;
    }

    await this.db.update(agents).set(dbUpdates).where(eq(agents.id, agentId));

    if (needsRedeploy && agent.coolifyAppUuid) {
      await this.agentsService.updateAgentEnvVars(agentId);
      await this.coolify.startApplication(agent.coolifyAppUuid);
    }

    return { success: true };
  }

  @Delete(":agentId")
  async remove(@Param("agentId") agentId: string, @CurrentUser() user: CurrentUserPayload) {
    const existing = await this.db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.userId, user.userId))).limit(1);
    if (existing.length === 0) throw new NotFoundException("Agent not found");
    await this.agentsService.deleteAgent(agentId);
    return { success: true };
  }

  @Post(":agentId/start")
  async start(@Param("agentId") agentId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.verifyOwnership(agentId, user.userId);
    await this.agentsService.startAgent(agentId);
    return { success: true };
  }

  @Post(":agentId/stop")
  async stop(@Param("agentId") agentId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.verifyOwnership(agentId, user.userId);
    await this.agentsService.stopAgent(agentId);
    return { success: true };
  }

  @Post(":agentId/restart")
  async restart(@Param("agentId") agentId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.verifyOwnership(agentId, user.userId);
    await this.agentsService.restartAgent(agentId);
    return { success: true };
  }

  @Post(":agentId/redeploy")
  async redeploy(@Param("agentId") agentId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.verifyOwnership(agentId, user.userId);
    await this.agentsService.redeployAgent(agentId);
    return { success: true };
  }

  @Get(":agentId/logs")
  async logs(@Param("agentId") agentId: string, @Query("tail") tail: string, @CurrentUser() user: CurrentUserPayload) {
    const agent = (await this.verifyOwnership(agentId, user.userId))[0];
    if (!agent.coolifyAppUuid) return { logs: "Agent has no Coolify application yet.", type: "info", status: null };
    const lines = tail ? Math.min(Number(tail), 1000) : 100;
    try {
      const [logs, app] = await Promise.all([
        this.coolify.getApplicationLogs(agent.coolifyAppUuid, lines),
        this.coolify.getApplication(agent.coolifyAppUuid).catch(() => null),
      ]);
      return { logs: logs || "No logs available.", type: "runtime", status: app?.status || null };
    } catch (err) {
      return { logs: `Error: ${err instanceof Error ? err.message : String(err)}`, type: "error", status: null };
    }
  }

  @Get(":agentId/workspace-sync")
  @Public()
  async downloadWorkspace(@Param("agentId") agentId: string, @Req() req: Request, @Res() res: Response) {
    const agent = await this.resolveAgentBySyncOrUser(agentId, req);
    if (!agent) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!agent.workspaceArchive) { res.status(204).end(); return; }
    const binary = Buffer.from(agent.workspaceArchive, "base64");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Length", String(binary.length));
    res.send(binary);
  }

  @Post(":agentId/workspace-sync")
  @Public()
  async uploadWorkspace(@Param("agentId") agentId: string, @Req() req: Request, @Res() res: Response) {
    const agent = await this.resolveAgentBySyncOrUser(agentId, req);
    if (!agent) { res.status(401).json({ error: "Unauthorized" }); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (body.length > 50 * 1024 * 1024) { res.status(413).json({ error: "Archive too large (max 50MB)" }); return; }
    const archive = body.toString("base64");
    await this.db.update(agents).set({ workspaceArchive: archive, updatedAt: new Date() }).where(eq(agents.id, agentId));
    res.json({ success: true, size: body.length });
  }

  private async verifyOwnership(agentId: string, userId: string) {
    const results = await this.db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.userId, userId))).limit(1);
    if (results.length === 0) throw new NotFoundException("Agent not found");
    return results;
  }

  private async resolveAgentBySyncOrUser(agentId: string, req: Request) {
    const userId = (req as any).user?.userId;
    const syncToken = req.headers["x-sync-token"] as string | undefined;
    if (!userId && !syncToken) return null;
    const conditions = userId ? and(eq(agents.id, agentId), eq(agents.userId, userId)) : eq(agents.id, agentId);
    const results = await this.db.select().from(agents).where(conditions).limit(1);
    if (results.length === 0) return null;
    if (syncToken && results[0].webuiAuthToken !== syncToken) return null;
    return results[0];
  }
}
