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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Hey ${name}!\n\nDeploy and manage your OpenClaw AI agents right here in Telegram. One tap to get started.`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Deploy OpenClaw",
                web_app: { url: `${baseUrl}/app/deploy` },
              },
            ],
            [
              {
                text: "My Agents",
                web_app: { url: `${baseUrl}/app` },
              },
            ],
          ],
        },
      }),
    });
  }

  return NextResponse.json({ ok: true });
}
