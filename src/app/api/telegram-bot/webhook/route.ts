import { NextResponse, type NextRequest } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string };
  };
}

export async function POST(req: NextRequest) {
  // Verify webhook secret if set
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update: TelegramUpdate = await req.json();

  if (update.message?.text === "/start") {
    const chatId = update.message.chat.id;
    const name = update.message.from?.first_name || "there";
    const appUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tma`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Hey ${name}!\n\nManage your Telehost agents, deploy new bots, and handle billing, all from right here in Telegram.`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Open Telehost",
                web_app: { url: appUrl },
              },
            ],
          ],
        },
      }),
    });
  }

  return NextResponse.json({ ok: true });
}
