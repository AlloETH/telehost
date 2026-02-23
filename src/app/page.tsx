import { TonConnectAuthButton } from "@/components/auth/ton-connect-button";
import { SUBSCRIPTION_TIERS } from "@/lib/constants";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <h1 className="text-xl font-bold">Telehost</h1>
        <TonConnectAuthButton />
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-5xl font-bold tracking-tight">
          Deploy AI Agents for
          <br />
          <span className="text-[var(--primary)]">Telegram + TON</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted-foreground)]">
          Launch autonomous Teleton agents with one click. Manage Telegram
          conversations, trade on DEXes, interact with TON blockchain — all
          powered by AI.
        </p>
        <div className="mt-10">
          <TonConnectAuthButton />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h3 className="mb-12 text-center text-3xl font-bold">
          Everything you need
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              title: "One-Click Deploy",
              desc: "Configure your agent, connect Telegram, and deploy. We handle Docker, scaling, and monitoring.",
            },
            {
              title: "112+ Built-in Tools",
              desc: "Telegram messaging, TON transfers, DEX trading, web search, file management, and more.",
            },
            {
              title: "Pay with TON",
              desc: "Connect your wallet, pick a plan, and pay with TON. No credit cards, no KYC.",
            },
            {
              title: "Multiple LLM Providers",
              desc: "Use Anthropic, OpenAI, Google, xAI, Groq, or OpenRouter. Bring your own API key.",
            },
            {
              title: "Secure by Design",
              desc: "Encrypted credentials, isolated containers, resource limits per agent. Your keys never leave encrypted storage.",
            },
            {
              title: "Real-time Monitoring",
              desc: "View logs, check health status, and manage your agents through the dashboard or WebUI.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
            >
              <h4 className="text-lg font-semibold">{f.title}</h4>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h3 className="mb-12 text-center text-3xl font-bold">
          Simple pricing
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {(
            Object.entries(SUBSCRIPTION_TIERS) as [
              string,
              (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS],
            ][]
          ).map(([key, tier]) => (
            <div
              key={key}
              className={`rounded-xl border p-6 ${
                key === "pro"
                  ? "border-[var(--primary)] bg-[var(--card)]"
                  : "border-[var(--border)] bg-[var(--card)]"
              }`}
            >
              <h4 className="text-lg font-semibold">{tier.name}</h4>
              <p className="mt-2 text-3xl font-bold">
                {tier.priceTon === 0 ? "Free" : `${tier.priceTon} TON`}
                {tier.priceTon > 0 && (
                  <span className="text-sm font-normal text-[var(--muted-foreground)]">
                    /mo
                  </span>
                )}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--muted-foreground)]">
                <li>
                  {tier.maxAgents} agent{tier.maxAgents > 1 ? "s" : ""}
                </li>
                <li>{tier.memoryLimitMb} MB RAM / agent</li>
                <li>{tier.cpuLimit} CPU / agent</li>
                {key === "free" && <li>{tier.trialDays}-day trial</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-6 py-8 text-center text-sm text-[var(--muted-foreground)]">
        Telehost — Powered by Teleton Agent &amp; TON Blockchain
      </footer>
    </main>
  );
}
