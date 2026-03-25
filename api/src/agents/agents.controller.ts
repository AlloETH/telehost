import { Controller, Get, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";
import { agents } from "../db/schema";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";

@Controller("agents")
export class AgentsController {
  constructor(@Inject(DB) private db: Db) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const userAgents = await this.db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        status: agents.status,
        lastHealthCheck: agents.lastHealthCheck,
        lastError: agents.lastError,
        createdAt: agents.createdAt,
        updatedAt: agents.updatedAt,
      })
      .from(agents)
      .where(eq(agents.userId, user.userId))
      .orderBy(agents.createdAt);

    return { agents: userAgents };
  }
}
