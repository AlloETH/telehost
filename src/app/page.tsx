import { TonConnectAuthButton } from "@/components/auth/ton-connect-button";
import { SUBSCRIPTION_TIERS } from "@/lib/constants";
import Link from "next/link";

const features = [
  {
    icon: "~>",
    title: "One-Click Deploy",
    desc: "Configure your agent, connect Telegram, and deploy. We handle Docker, scaling, and monitoring.",
  },
  {
    icon: "{}",
    title: "112+ Built-in Tools",
    desc: "Telegram messaging, TON transfers, DEX trading, web search, file management, and more.",
  },
  {
    icon: "<>",
    title: "Pay with TON",
    desc: "Connect your wallet, pick a plan, and pay with TON. No credit cards, no KYC.",
  },
  {
    icon: "//",
    title: "Multiple LLMs",
    desc: "Use Anthropic, OpenAI, Google, xAI, Groq, or OpenRouter. Bring your own API key.",
  },
  {
    icon: "##",
    title: "Secure by Design",
    desc: "Encrypted credentials, isolated containers, resource limits. Your keys never leave encrypted storage.",
  },
  {
    icon: ">>",
    title: "Real-time Monitoring",
    desc: "View logs, check health, and manage agents through the dashboard or built-in WebUI.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
            T
          </div>
          <span className="text-lg font-bold tracking-tight">Telehost</span>
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          <a href="#features" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Features</a>
          <a href="#pricing" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Pricing</a>
          <TonConnectAuthButton />
        </nav>
        <div className="md:hidden">
          <TonConnectAuthButton />
        </div>
      </header>

      {/* Hero */}
      <section className="glow-blue grid-bg relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 pb-24 pt-28 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-sm text-[var(--muted-foreground)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
            Powered by Teleton Agent
          </div>
          <h2 className="text-5xl font-bold tracking-tight leading-[1.1] md:text-6xl">
            Deploy AI Agents for
            <br />
            <span className="gradient-text">Telegram + TON</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted-foreground)]">
            Launch autonomous AI agents that manage Telegram conversations, trade on DEXes, and interact with TON blockchain — all with one click.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/dashboard/agents/new"
              className="rounded-lg bg-[var(--primary)] px-6 py-3 text-sm font-medium text-white hover:brightness-110 transition-all"
            >
              Deploy Your Agent
            </Link>
            <a
              href="#features"
              className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-5xl px-6 py-24">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-[var(--primary)]">Features</p>
          <h3 className="mt-3 text-3xl font-bold tracking-tight">
            Everything you need to run AI agents
          </h3>
          <p className="mx-auto mt-4 max-w-lg text-[var(--muted-foreground)]">
            From deployment to monitoring, we handle the infrastructure so you can focus on what your agent does.
          </p>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="glow-card group rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all duration-200"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)]/10 font-mono text-sm text-[var(--primary)]">
                {f.icon}
              </div>
              <h4 className="text-base font-semibold">{f.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-[var(--border)] bg-[var(--card)]/30">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-[var(--primary)]">Pricing</p>
            <h3 className="mt-3 text-3xl font-bold tracking-tight">
              Simple, transparent pricing
            </h3>
            <p className="mx-auto mt-4 max-w-lg text-[var(--muted-foreground)]">
              Pay with TON. No credit cards, no KYC. Cancel anytime.
            </p>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {(
              Object.entries(SUBSCRIPTION_TIERS) as [
                string,
                (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS],
              ][]
            ).map(([key, tier]) => {
              const isPro = key === "pro";
              return (
                <div
                  key={key}
                  className={`relative rounded-xl border p-6 transition-all duration-200 ${
                    isPro
                      ? "border-[var(--primary)]/50 bg-[var(--card)] shadow-[0_0_30px_rgba(59,130,246,0.08)]"
                      : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]/30"
                  }`}
                >
                  {isPro && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-0.5 text-xs font-medium text-white">
                      Popular
                    </div>
                  )}
                  <h4 className="text-lg font-semibold">{tier.name}</h4>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{tier.priceTon}</span>
                    <span className="ml-1 text-[var(--muted-foreground)]">TON/mo</span>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm">
                    <li className="flex items-center gap-2 text-[var(--muted-foreground)]">
                      <span className="text-[var(--success)]">+</span>
                      {tier.maxAgents} agent{tier.maxAgents > 1 ? "s" : ""}
                    </li>
                    <li className="flex items-center gap-2 text-[var(--muted-foreground)]">
                      <span className="text-[var(--success)]">+</span>
                      {tier.memoryLimitMb} MB RAM per agent
                    </li>
                    <li className="flex items-center gap-2 text-[var(--muted-foreground)]">
                      <span className="text-[var(--success)]">+</span>
                      {tier.cpuLimit} vCPU per agent
                    </li>
                  </ul>
                  <Link
                    href="/dashboard/agents/new"
                    className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-medium transition-all ${
                      isPro
                        ? "bg-[var(--primary)] text-white hover:brightness-110"
                        : "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]"
                    }`}
                  >
                    Get Started
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--primary)] text-xs font-bold text-white">
              T
            </div>
            Telehost
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Powered by Teleton Agent &amp; TON Blockchain
          </p>
        </div>
      </footer>
    </main>
  );
}
