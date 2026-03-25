import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { OpenclawService } from "./openclaw.service";

@Controller("agents/:agentId/sessions")
export class SessionsController {
  constructor(private readonly oc: OpenclawService) {}

  @Get()
  async list(
    @Param("agentId") agentId: string,
    @Query("search") search: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const client = await this.oc.resolveClient(agentId, user.userId);
    const result = await this.oc.toolsInvoke<{ sessions: unknown[] }>(
      client,
      "sessions_list",
      {
        limit: 50,
        includeLastMessage: true,
        includeDerivedTitles: true,
        ...(search ? { search } : {}),
      },
    );
    return { sessions: result.sessions ?? [] };
  }

  @Post()
  async create(
    @Param("agentId") agentId: string,
    @Body() body: { label?: string; message?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const client = await this.oc.resolveClient(agentId, user.userId);
    const result = await this.oc.toolsInvoke<{ key: string }>(
      client,
      "sessions_create",
      {
        agentId: "main",
        ...(body.label ? { label: body.label } : {}),
        ...(body.message ? { message: body.message } : {}),
      },
    );
    return result;
  }

  @Get(":sessionKey/history")
  async history(
    @Param("agentId") agentId: string,
    @Param("sessionKey") sessionKey: string,
    @Query("limit") limit: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const client = await this.oc.resolveClient(agentId, user.userId);
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit);
    const result = await this.oc.gwJson<{ messages: unknown[] }>(
      client,
      `/sessions/${encodeURIComponent(sessionKey)}/history?${params}`,
    );
    return { messages: result.messages ?? [] };
  }

  @Delete(":sessionKey")
  async delete(
    @Param("agentId") agentId: string,
    @Param("sessionKey") sessionKey: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const client = await this.oc.resolveClient(agentId, user.userId);
    await this.oc.toolsInvoke(client, "sessions_delete", { key: sessionKey });
    return { ok: true };
  }
}
