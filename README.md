<div align="center">
  <img src="https://raw.githubusercontent.com/Wizbisy/mintlify-docs/main/logo/dark.svg" alt="Aegis Logo" width="300" />

  <h1>Aegis</h1>
  <p><strong>Autonomous Wealth Infrastructure for AI Agents</strong></p>
  <p>Built for the <a href="https://agora.thecanteenapp.com/">Agora Agents Hackathon</a> by Canteen × Circle</p>

  <p>
    <img src="https://img.shields.io/badge/Network-Arc%20Testnet-00F396?style=for-the-badge&logo=circle" alt="Arc Testnet" />
    <img src="https://img.shields.io/badge/Smart%20Contracts-Foundry-gray?style=for-the-badge" alt="Foundry" />
    <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Hono-black?style=for-the-badge&logo=nodedotjs" alt="Backend" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql" alt="Postgres" />
  </p>
</div>

---

## 🚀 The Problem & The Solution

**The Problem:** AI Agents are becoming highly intelligent, but they are financially paralyzed. They cannot safely hold money, they struggle to interact with complex DeFi protocols, and they cannot securely manage long-term wealth without risking user funds to hallucinated transactions.

**The Solution:** **Aegis** is a security-hardened, intent-based financial layer designed explicitly for AI. It acts as an unbreakable firewall between the AI agent's brain and its wallet. Agents interact with Aegis via natural intents (e.g., "Yield my idle USDC"), and Aegis executes the transactions on the **Arc Network**, enforcing strict cryptographic policies, idempotency, and spending caps.

## ✨ Core Platform Features

### 🤖 Built for AI
* **The `SKILL.md` Protocol**: Aegis provides a live, dynamic `SKILL.md` file that can be ingested into any LLM's system prompt (Claude, GPT-4, Gemini), instantly teaching the agent how to interact with the financial layer.
* **Idempotency & Handshakes**: A strict 3-step nonce protocol prevents agents from accidentally double-spending or hallucinating transactions.

### 💰 The Wealth Engine
* **Auto-Compounding Yield**: Agents can deposit idle USDC into the Aegis ERC-4626 Vault to earn yield.
* **Smart Routing**: Support for Limit Orders, DCA schedules, and multi-yield allocation.
* **Tax Loss Harvesting**: Automated FIFO and LIFO cost-basis analysis executed directly on-chain.

### 🌉 Seamless Value Transfer
* **Gasless Arc Transactions**: Gas is fully abstracted. Agents send USDC on the Arc L1 without needing native gas tokens.
* **x402 Micropayments**: Agents can autonomously discover and pay for external APIs and data services.
* **Circle CCTP**: Instant cross-chain bridging of USDC across 7+ testnets.

---

## 🏗️ Monorepo Architecture

Because Aegis is a massive full-stack infrastructure, the repository is cleanly modularized:

| Directory | Purpose | Repository Status |
|-----------|---------|-------------------|
| `aegis/` | The REST API backend. | [Standalone Repo](https://github.com/Wizbisy/aegis) |
| `aegis-ui/` | The Next.js web dashboard for human oversight. | Included here |
| `contracts/` | Solidity smart contracts (ERC-4626 Vaults). | Included here |
| `docs/` | The Mintlify documentation site. | [Standalone Repo](https://github.com/Wizbisy/mintlify-docs) |

---

## 🔧 Technical Stack

* **Blockchain**: Arc Testnet (Chain ID: `5042002`)
* **Wallets**: Circle Developer Controlled Wallets (DCW)
* **Cross-Chain**: Circle CCTP
* **Backend**: Node.js, TypeScript, Hono, Prisma, PostgreSQL
* **Frontend**: Next.js 14, Tailwind CSS, Framer Motion
* **Smart Contracts**: Solidity, Foundry, OpenZeppelin

---

## 🚀 Quick Start (Local Development)

### 1. Backend Setup (`aegis/`)
```bash
cd aegis
npm install
# Create your .env file
cp .env.example .env 
# Generate Prisma Client
npx prisma generate
# Start the dev server
npm run dev
```

### 2. Frontend Setup (`aegis-ui/`)
```bash
cd aegis-ui
npm install
# Ensure .env.local points BACKEND_URL to your local or remote aegis API
npm run dev
```

### 3. Smart Contracts (`contracts/`)
```bash
cd contracts
forge build
forge test 
```

---

## 📖 Comprehensive Documentation

Our full API reference, architecture guides, and agent integration tutorials are hosted on our dedicated Mintlify site.

👉 **[Read the Aegis Documentation](https://docs.aegisintent.xyz)**

To view the documentation locally:
```bash
cd docs
npx mintlify dev
```

---

## 🔗 Deployed Infrastructure Links

* **Live API**: `https://api.aegisintent.xyz`
* **Agent Skill File**: `https://api.aegisintent.xyz/SKILL.md`
* **Documentation**: `https://docs.aegisintent.xyz`
* **Aegis Vault Contract**: [`0xAf5f79495285b1d180858a225aDE518d371e0167`](https://testnet.arcscan.app/address/0xAf5f79495285b1d180858a225aDE518d371e0167) 
* **Arc Explorer**: [testnet.arcscan.app](https://testnet.arcscan.app)

---

<div align="center">
  <p>Built by <a href="https://github.com/Wizbisy">@wizbisy</a> for the future of Autonomous Finance.</p>
</div>
