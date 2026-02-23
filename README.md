# Telehost

AI agent hosting platform for Telegram + TON blockchain. Deploy autonomous agents that manage conversations, trade on DEXes, and interact with the TON network.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Next.js 16, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | PostgreSQL + Drizzle ORM |
| Blockchain | TON SDK, TON Connect |
| Auth | TON wallet proof, JWT sessions |
| Encryption | AES-256-GCM (scrypt key derivation) |
| Infrastructure | Coolify (Docker Compose) |
| Hosting | AWS Amplify |

## Features

- **One-Click Deploy** - Configure your agent, connect Telegram, and deploy. Docker containers, scaling, and monitoring are handled automatically.
- **112+ Built-in Tools** - Telegram messaging, TON transfers, DEX trading, web search, file management, and more via the Teleton Agent runtime.
- **Pay with TON** - Connect your wallet, pick a plan, and pay in TON. No credit cards, no KYC.
- **Multiple LLMs** - Anthropic, OpenAI, Google, xAI, Groq, or OpenRouter. Bring your own API key.
- **Secure by Design** - Encrypted credentials (AES-256-GCM), isolated Docker containers, per-agent resource limits.
- **Real-time Monitoring** - View logs, check health, and manage agents through the dashboard or built-in WebUI.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 13+
- Coolify instance with API access
- TON wallet (for testing payments)

### Installation

```bash
git clone https://github.com/AlloETH/telehost.git
cd telehost
npm install
```

### Environment Variables

Create a `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/telehost

# Encryption (generate: openssl rand -hex 32)
ENCRYPTION_SECRET=
JWT_SECRET=

# Coolify
COOLIFY_API_URL=https://your-coolify.example.com/api/v1
COOLIFY_API_TOKEN=
COOLIFY_PROJECT_UUID=
COOLIFY_SERVER_UUID=
COOLIFY_ENVIRONMENT_NAME=production
AGENT_BASE_DOMAIN=example.com

# Payments
TON_SERVICE_WALLET_ADDRESS=

# Public
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TON_CONNECT_MANIFEST_URL=http://localhost:3000/tonconnect-manifest.json
```

### Database Setup

```bash
npm run db:push
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm run start
```

## Architecture

### Agent Deployment Flow

1. User submits agent config (LLM provider, API key, model, Telegram credentials)
2. Backend generates a YAML config, encrypts it with AES-256-GCM, and stores it in the database
3. A Docker Compose app is created on Coolify with a persistent volume (`teleton-data`)
4. A TON W5R1 wallet is generated for the agent, mnemonic encrypted and stored
5. Config, wallet, and optional Telegram session are injected as base64-encoded environment variables
6. Coolify deploys the container from `ghcr.io/alloeth/telehost-agent:latest`

### Telegram Session Authentication

1. User provides Telegram API ID, API Hash, and phone number
2. Backend starts an async GramJS session (stored in-memory on `globalThis` to survive HMR)
3. Frontend polls for status until a code is requested
4. User submits the verification code (and 2FA password if enabled)
5. Session string is encrypted and injected into the agent's Coolify environment

### Payment Flow

1. User selects a subscription tier (Basic/Pro/Enterprise)
2. Backend generates a unique memo (UUID) and returns payment details
3. User sends TON to the service wallet with the memo
4. Backend verifies the transaction on-chain and activates the subscription

## Subscription Tiers

| Tier | Agents | RAM | CPU | Price |
|------|--------|-----|-----|-------|
| Basic | 1 | 512 MB | 0.5 vCPU | 5 TON/mo |
| Pro | 3 | 1024 MB | 1.0 vCPU | 12 TON/mo |
| Enterprise | 10 | 2048 MB | 2.0 vCPU | 30 TON/mo |

## Project Structure

```
src/
  app/
    api/
      agents/              # CRUD, start/stop/restart/redeploy, wallet, logs
      auth/                # TON Connect proof verification, sessions
      billing/             # Subscribe, verify payment, status
      telegram-session/    # Start, poll status, verify code/2FA
    dashboard/
      page.tsx             # Overview with stats
      agents/
        page.tsx           # Agent list
        new/page.tsx       # Creation wizard
        [agentId]/
          page.tsx         # Agent detail + settings
          logs/page.tsx    # Live log viewer
          session/page.tsx # Telegram session setup
      billing/page.tsx     # Subscription management
    page.tsx               # Landing page
  components/
    auth/                  # TON Connect button
    layout/                # Dashboard shell (sidebar + header)
  lib/
    agents/
      deployment.ts        # Create, start, stop, restart, redeploy, delete
      config-generator.ts  # YAML config generation
      slug.ts              # Name-to-slug conversion
      sync-status.ts       # Sync agent status from Coolify
    auth/
      ton-proof.ts         # TON proof signature verification
      session.ts           # JWT session management
    coolify/
      client.ts            # Coolify REST API wrapper
    db/
      schema.ts            # 7 tables, 5 enums (Drizzle ORM)
      index.ts             # Database connection
    telegram/
      session-manager.ts   # GramJS session handling (in-memory)
    ton/
      wallet.ts            # W5R1 wallet generation
      payment.ts           # Payment memo generation
    crypto.ts              # AES-256-GCM encrypt/decrypt
    constants.ts           # Tiers, limits, Docker image config
  middleware.ts            # Route protection (JWT validation)
```

## API Routes

### Authentication
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/auth/ton-proof/payload` | Generate TON Connect challenge |
| POST | `/api/auth/ton-proof/verify` | Verify wallet proof, create session |
| GET | `/api/auth/session` | Validate current session |

### Agents
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents` | List user's agents |
| POST | `/api/agents` | Create and deploy a new agent |
| GET | `/api/agents/check-name` | Check name availability |
| GET | `/api/agents/[id]` | Get agent details + decrypted config |
| PATCH | `/api/agents/[id]` | Update settings (triggers redeploy) |
| DELETE | `/api/agents/[id]` | Delete agent and Coolify app |
| POST | `/api/agents/[id]/start` | Start agent |
| POST | `/api/agents/[id]/stop` | Stop agent |
| POST | `/api/agents/[id]/restart` | Restart agent |
| POST | `/api/agents/[id]/redeploy` | Force redeploy with latest image |
| GET | `/api/agents/[id]/logs` | Fetch container logs |
| POST | `/api/agents/[id]/wallet` | Generate TON wallet |
| GET | `/api/agents/[id]/wallet/mnemonic` | Reveal encrypted mnemonic |

### Billing
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/billing/subscribe` | Generate payment memo |
| GET | `/api/billing/status` | Get subscription status |
| POST | `/api/billing/verify-payment` | Verify TON transaction |

### Telegram Session
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/telegram-session/start` | Initiate Telegram auth |
| GET | `/api/telegram-session/status` | Poll auth progress |
| POST | `/api/telegram-session/verify-code` | Submit verification code |
| POST | `/api/telegram-session/verify-2fa` | Submit 2FA password |

## Database Schema

7 tables across PostgreSQL:

- **users** - Wallet address, display name, timestamps
- **sessions** - JWT tokens with expiry
- **agents** - Name, slug, status, encrypted config/session/wallet, Coolify UUID, health metadata
- **subscriptions** - Tier, status, resource limits, billing period
- **payments** - Amount, memo, tx hash, status
- **auditLog** - User/agent actions with metadata

## Security

- All sensitive data (configs, Telegram sessions, wallet mnemonics) encrypted at rest with AES-256-GCM
- Key derivation via scrypt with random salt per record
- Agent containers are isolated with per-tier CPU/memory limits
- Persistent volumes scoped per agent
- JWT session tokens with expiry
- Middleware protects all `/dashboard` and `/api` routes (except auth endpoints)
- TON proof verification for wallet authentication

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio
```

## Deployment

The project is configured for AWS Amplify (`amplify.yml`) with:
- Node.js 20 runtime
- Standalone Next.js output
- Automatic builds on push
- Cache for `node_modules` and `.next/cache`

## License

All rights reserved.
