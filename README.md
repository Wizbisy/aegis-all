# Aegis — Autonomous Wealth Infrastructure for AI Agents

> **Built for the [Agora Agents Hackathon](https://agora.thecanteenapp.com/) by Canteen × Circle**

Aegis is a security-hardened financial infrastructure layer that gives AI agents the ability to hold, spend, and grow money autonomously on the **Arc Network** (Circle's purpose-built L1 blockchain).

## 🏗️ Architecture

```
canteen-arc-x-agora-hackathon/
├── aegis/           # the core backend
├── aegis-ui/        # dashboard UI
├── contracts/       # Solidity smart contracts (Foundry)
└── docs/            # Mintlify documentation site
```

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| **Agent Onboarding** | Email OTP → Bearer token → Circle DCW wallet provisioned automatically |
| **USDC Transfers** | Gas-abstracted USDC transfers to any EVM address on Arc |
| **x402 Micropayments** | Autonomous agent-to-service payments via the x402 protocol |
| **Token Swaps** | USDC ↔ EURC ↔ cirBTC swaps via Circle App Kit |
| **Cross-Chain Bridging** | USDC bridging via Circle CCTP to 7+ testnets |
| **Yield Vault** | Deposit USDC → receive aUSDC shares → earn auto-compounding yield |
| **Wealth Engine** | Limit orders, DCA schedules, and multi-yield allocation (Aegis Vault + Synthra V3) |
| **Tax Loss Harvesting** | Automated FIFO cost-basis analysis and loss harvesting execution |
| **Policy Engine** | Per-tx, daily, weekly, and monthly spending caps enforced at the database level |
| **Audit Trail** | Immutable, append-only audit log for every financial action |

## 🔧 Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: [Hono](https://hono.dev/) (ultra-fast REST API)
- **Database**: PostgreSQL + [Prisma ORM](https://www.prisma.io/)
- **Wallets**: [Circle Developer Controlled Wallets](https://developers.circle.com/w3s/developer-controlled-wallets-quickstart)
- **Bridging**: [Circle CCTP](https://developers.circle.com/stablecoins/cctp-getting-started)
- **Yield**: Custom ERC-4626 Vault + Synthra V3 Concentrated Liquidity
- **Smart Contracts**: Solidity + Foundry
- **Docs**: [Mintlify](https://mintlify.com/)
- **Network**: Arc Testnet (Chain ID: 5042002)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Circle API credentials ([get them here](https://developers.circle.com/))

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/canteen-arc-x-agora-hackathon.git
cd canteen-arc-x-agora-hackathon

# Install backend dependencies
cd aegis
cp .env.example .env   # Fill in your credentials
npm install

# Setup database
npx prisma db push

# Start the server
npm run dev
```

### Agent Skill File

Aegis ships with a pre-compiled `SKILL.md` that any LLM can ingest to autonomously interact with the platform:

```bash
curl https://api.aegisintent.xyz/SKILL.md
```

## 📖 Documentation

Full API documentation is available at [docs.aegisintent.xyz](https://docs.aegisintent.xyz) or run locally:

```bash
cd docs
npx mintlify dev
```

## 🔗 Key Links

- **Live API**: `https://api.aegisintent.xyz`
- **Documentation**: [docs.aegisintent.xyz](https://docs.aegisintent.xyz)
- **Vault Contract**: [`0xAf5f79495285b1d180858a225aDE518d371e0167`](https://testnet.arc-explorer.com/address/0xAf5f79495285b1d180858a225aDE518d371e0167)
- **Arc Testnet Explorer**: [testnet.arc-explorer.com](https://testnet.arc-explorer.com)

## 📄 License

MIT
