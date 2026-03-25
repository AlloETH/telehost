import { Controller, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator";

@Controller("telegram-bot")
export class TelegramBotController {
  @Post("webhook")
  @Public()
  async webhook(@Req() req: Request, @Res() res: Response) {
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const update = req.body;
    if (update?.message?.text === "/start") {
      const chatId = update.message.chat.id;
      const name = update.message.from?.first_name || "there";
      const appUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tma`;

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Hey ${name}!\n\nManage your Telehost agents, deploy new bots, and handle billing, all from right here in Telegram.`,
          reply_markup: { inline_keyboard: [[{ text: "Open Telehost", web_app: { url: appUrl } }]] },
        }),
      });
    }

    res.json({ ok: true });
  }
}
