import { Controller, Post, Param, Body, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { OpenclawService } from "./openclaw.service";
import { Readable } from "stream";

@Controller("agents/:agentId/chat")
export class ChatController {
  constructor(private readonly oc: OpenclawService) {}

  @Post()
  async send(
    @Param("agentId") agentId: string,
    @Body() body: { sessionKey?: string; messages: Array<{ role: string; content: string }>; model?: string },
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    if (!body.messages?.length) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    let client: Awaited<ReturnType<OpenclawService["resolveClient"]>>;
    try {
      client = await this.oc.resolveClient(agentId, user.userId);
    } catch (err: any) {
      console.error("[chat] resolveClient error:", err.message);
      throw err;
    }

    const gwHeaders: Record<string, string> = {
      ...this.oc.headers(client),
    };
    if (body.sessionKey) {
      gwHeaders["X-OpenClaw-Session-Key"] = body.sessionKey;
    }

    const payload: Record<string, unknown> = {
      messages: body.messages,
      stream: true,
    };
    if (body.model) payload.model = body.model;

    let gwRes: globalThis.Response;
    try {
      console.log(`[chat] POST ${client.baseUrl}/v1/chat/completions`);
      gwRes = await fetch(`${client.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: gwHeaders,
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.error("[chat] gateway fetch error:", err.message, err.cause);
      res.status(502).json({ error: "Cannot reach agent gateway", detail: err.message });
      return;
    }

    if (!gwRes.ok) {
      const text = await gwRes.text().catch(() => "");
      res.status(gwRes.status >= 500 ? 502 : gwRes.status).json({
        error: "Gateway error",
        detail: text,
      });
      return;
    }

    // Pipe SSE stream directly to the client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = gwRes.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: "No response body from gateway" });
      return;
    }

    const stream = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
            return;
          }
          this.push(Buffer.from(value));
        } catch {
          this.push(null);
        }
      },
    });

    stream.pipe(res);
  }
}
