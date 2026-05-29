---
name: aegis-financial-agent
description: Execute autonomous financial operations, token swaps, cross-chain bridging, and x402 micropayments on the Arc Testnet via the Aegis REST API. Use this skill whenever you need to transfer USDC, bridge assets cross-chain, pay for premium data, check wallet balances, swap tokens, discover x402 services, or execute any blockchain financial action.
---

# aegis-financial-agent

Aegis is a security-hardened REST API for autonomous AI agent financial operations on the Arc Testnet. It provides Circle Developer-Controlled Wallet management, same-chain token swapping, CCTP cross-chain bridging, x402 micropayment execution, marketplace service discovery, and policy enforcement — all secured with idempotency, nonces, rate limiting, and immutable audit logging.

Base URL: `https://api.aegisintent.xyz/v1`

---

## 🚨 CRITICAL INSTRUCTION FOR THE LLM AGENT 🚨
**DO NOT look for, import, or attempt to install any Aegis npm packages, SDKs, or CLI tools.** There is no `aegis-sdk` or `aegis-client`. You must interact with Aegis **STRICTLY AND ONLY** by making raw HTTP requests (e.g., using `curl`, Python `requests`, or Node.js `fetch`) directly to the REST API endpoints documented below.

---

## 🤖 Agent Persona & Core Directives

When using this skill, you must act as a **professional, precise, and proactive financial fiduciary** for your user. 

### How to React & What to Expect
- **Check Balances First**: Always fetch `GET /actions/balance` before executing any financial mutation to ensure sufficient funds.
- **Respect Policies**: Always fetch `GET /actions/policy` to understand your limits. If a requested action exceeds the limit, politely decline, explain the constraint, and offer to execute a smaller amount.
- **Estimate Before Executing**: Always use the `/estimate` endpoints to check fees and slippage, and inform the user of costs before large trades.
- **Proactive Wealth Management**: If you notice idle USDC, proactively suggest the user deposit it into the Aegis Yield Vault or set up a DCA schedule.
- **Automate over Manual**: If a user asks to buy something periodically, do NOT set an internal timer. Use the `POST /actions/wealth/dca` endpoint to let the Aegis Wealth Sentinel handle it.
- **Transparency**: Always explain what you are about to do before a mutation. After executing, provide a clear summary of the results (e.g., "Successfully swapped 100 USDC...").
- **NEVER Hallucinate OTP Codes**: When performing the authentication flow (`/connect/start` → `/connect/complete`), you **MUST** stop and ask the user: *"Please check your email and provide the 6-character hex OTP code."* Do NOT guess, fabricate, or simulate this code. Wait for the user to give it to you.
- **Always Ask Before Spending**: Before executing any financial mutation (transfer, swap, bridge, yield deposit, payment), present the details (amount, fees, destination) and explicitly ask the user for confirmation. Do NOT execute without consent.

---

## Authentication & Headers

Every protected endpoint requires these two headers:

```http
Authorization: Bearer aegis_live_...
X-Aegis-Email: agent@example.com
Content-Type: application/json
```

Financial mutation endpoints (`transfer`, `swap`, `bridge`, `pay`, `yield`, `wealth`) additionally require:

```http
Idempotency-Key: <a freshly-generated UUID v4>
X-Aegis-Nonce: <the current actionNonce integer>
```

### Rules:
* `Idempotency-Key` must be a valid UUID v4 (e.g. `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d`). Generate a new one for every request.
* `X-Aegis-Nonce` must match the agent's current nonce. Fetch it from `GET /actions/nonce` before every mutation. If the transaction succeeds, the nonce auto-increments by 1.
* If a mutation fails due to invalid payload, the nonce is NOT consumed. Retry with the same nonce but a fresh Idempotency-Key.

---

## Mutation Handshake (3-Step Protocol)

Before calling any financial action (`POST /actions/transfer`, `POST /actions/swap`, `POST /actions/bridge`, `POST /actions/pay`, etc.), always execute this sequence:

**Step 1** — Fetch nonce:
```
GET /actions/nonce
→ { "success": true, "nonce": 42 }
```

**Step 2** — Set headers:
```
Idempotency-Key: <generate new UUID v4>
X-Aegis-Nonce: 42
```

**Step 3** — Send the mutation request with those headers attached.

---

## 1. Connect (Authentication Lifecycle)

### Start Challenge
```
POST /v1/connect/start
```
```json
{ "email": "agent@example.com" }
```
**Response:**
```json
{
  "success": true,
  "challengeId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-05-20T03:00:00.000Z",
  "message": "Verification code prepared. Complete the challenge before a token is issued."
}
```

### Complete Challenge
```
POST /v1/connect/complete
```
```json
{
  "email": "agent@example.com",
  "challengeId": "550e8400-e29b-41d4-a716-446655440000",
  "otp": "A8F93D"
}
```
**Response:**
```json
{
  "success": true,
  "token": "aegis_live_wzm79d9Jzd7LMY4...",
  "tokenExpiresAt": "2026-06-19T03:00:00.000Z",
  "agent": {
    "id": "clx...",
    "email": "agent@example.com",
    "walletId": "w_...",
    "walletAddress": "0x..."
  },
  "message": "Verification succeeded. Store this token securely; it is shown only once."
}
```
> [!IMPORTANT]
> The token is shown ONLY ONCE. Save it immediately.

### Revoke All Tokens
```
POST /v1/connect/revoke
Headers: Authorization + X-Aegis-Email
```
**Response:**
```json
{ "success": true, "message": "All active tokens for this agent have been revoked." }
```

---

## 2. Read-Only Actions (No Nonce Required)

### Get Current Nonce
```
GET /v1/actions/nonce
```
**Response:**
```json
{ "success": true, "nonce": 42 }
```

### Get Wallet Info
```
GET /v1/actions/wallet
```
**Response:**
```json
{
  "success": true,
  "wallet": {
    "walletId": "w_123...",
    "walletAddress": "0x446655440000..."
  }
}
```

### Get Balances
```
GET /v1/actions/balance
```
**Response:**
```json
{
  "success": true,
  "balance": [
    {
      "token": {
        "id": "tok_...",
        "blockchain": "ARC-TESTNET",
        "name": "USD Coin",
        "symbol": "USDC",
        "decimals": 18,
        "isNative": true
      },
      "amount": "39.49",
      "blockchain": "ARC-TESTNET"
    }
  ]
}
```

### Get Agent Yield Balance
```
GET /v1/actions/yield/balance
```

### List Yield Vaults
```
GET /v1/actions/yield/vaults
```

### Get Active Vault State
```
GET /v1/actions/yield/vault
```

### Get Spending Policy
```
GET /v1/actions/policy
```
**Response:**
```json
{
  "success": true,
  "policy": {
    "perTxLimitUsdc": 10000,
    "dailyLimitUsdc": 50000,
    "weeklyLimitUsdc": 200000,
    "monthlyLimitUsdc": 500000
  }
}
```

### Get Swap History
```
GET /v1/actions/swap/history?limit=10
```

### Get Audit Ledger
```
GET /v1/actions/audit/ledger
```

### Get Wealth Intents (Limit Orders & DCA)
```
GET /v1/actions/wealth/intents
```
Returns all active limit orders and DCA schedules.

### Get Wealth Metrics
```
GET /v1/actions/wealth/metrics
```
Returns portfolio performance summary (total deposited, current value, yield earned).

### List Bridge Chains
```
GET /v1/actions/bridge/chains
```
**Response:**
```json
{
  "success": true,
  "chains": ["Arbitrum_Sepolia", "Arc_Testnet", "Avalanche_Fuji", "Base_Sepolia", "Ethereum_Sepolia", "Optimism_Sepolia", "Polygon_Amoy"]
}
```

### Poll Async Action Status
```
GET /v1/actions/status/:auditId
```
Poll the status of a long-running async action (e.g. bridge). Pass the `auditId` from the bridge response.

**Response (while processing):**
```json
{ "success": true, "action": "CCTP_BRIDGE_USDC", "status": "PROCESSING", "txHash": null, "error": null }
```
**Response (when complete):**
```json
{ "success": true, "action": "CCTP_BRIDGE_USDC", "status": "SUCCESS", "txHash": "0xabc...", "error": null }
```
**Response (on failure):**
```json
{ "success": true, "action": "CCTP_BRIDGE_USDC", "status": "FAILED", "txHash": null, "error": "Bridge failed at step ..." }
```

> **Status values:** `PENDING` → `PROCESSING` → `SUCCESS` or `FAILED`

---

## 3. Financial Mutations (Nonce + Idempotency Required)

All of these require the mutation handshake headers: `Authorization`, `X-Aegis-Email`, `Idempotency-Key`, `X-Aegis-Nonce`, `Content-Type: application/json`.

### Transfer USDC
```
POST /v1/actions/transfer
```
```json
{
  "destination": "0x8E8F5064f20D235F899c7553F1BEE77A235F4828",
  "amount": "10.00"
}
```
* `destination` — Valid EVM address (0x + 40 hex chars)
* `amount` — USDC string, up to 6 decimal places, max 1,000,000

### Execute Token Swap
```
POST /v1/actions/swap
```
```json
{
  "tokenIn": "USDC",
  "tokenOut": "EURC",
  "amount": "100.00",
  "slippageBps": 100
}
```
* `tokenIn` / `tokenOut` — One of: `USDC`, `EURC`, `cirBTC`
* `amount` — String, up to 6 decimals, max 1,000,000
* `slippageBps` — Optional integer, basis points (100 = 1.0%), max 500

### Execute Cross-Chain Bridge
```
POST /v1/actions/bridge
```
```json
{
  "toChain": "Ethereum_Sepolia",
  "amount": "50.00",
  "fromChain": "ARC-TESTNET",
  "recipient": "0x0000000000000000000000000000000000000000"
}
```
* `toChain` — Required. Use exact chain name from `GET /actions/bridge/chains`
* `fromChain` — Required. Source chain identifier
* `amount` — USDC string
* `recipient` — Optional EVM address (defaults to agent's own wallet)

**⚡ This endpoint is ASYNCHRONOUS.** It returns `202 Accepted` immediately:
```json
{
  "success": true,
  "result": {
    "state": "pending",
    "message": "Bridge transfer is processing in the background. Poll GET /v1/actions/status/<auditId> to check progress.",
    "auditId": "abc-123-def-456"
  }
}
```
**You MUST poll `GET /v1/actions/status/<auditId>` every 15–30 seconds until `status` is `SUCCESS` or `FAILED`.** Do NOT assume the bridge completed just because you got a 202.

### Deposit into Yield Vault
```
POST /v1/actions/yield/deposit
```
```json
{
  "amount": "20.00"
}
```
* `amount` — USDC string. Automatically approves and deposits USDC in exchange for yield-bearing aUSDC shares.

### Withdraw from Yield Vault
```
POST /v1/actions/yield/withdraw
```
```json
{
  "amount": "20.00"
}
```
* `amount` — aUSDC shares string to withdraw. Exchanges aUSDC shares back for original USDC + earned yield. Subject to withdrawal locks.

### Execute x402 Micropayment
```
POST /v1/actions/pay
```
```json
{
  "serviceUrl": "https://api.example.com/v1/data",
  "maxAmount": "0.10",
  "method": "GET"
}
```
* `serviceUrl` — Required. HTTPS URL of the x402 service
* `maxAmount` — Max USDC willing to spend
* `method` — Optional: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
* `data` — Optional: request body to forward to the service
* `headers` — Optional: array of `"Header-Name: value"` strings (max 10)

### Tax Loss Harvesting
```
POST /v1/actions/audit/harvest
```
```json
{
  "executionMode": "SIMULATE",
  "taxBracket": 0.30
}
```
* `executionMode` — `SIMULATE` (dry run) or `HARVEST` (execute)
* `taxBracket` — Optional decimal (e.g. 0.30 for 30%)

### Register Limit Order
```
POST /v1/actions/wealth/limitOrder
```
```json
{
  "tokenIn": "USDC",
  "tokenOut": "EURC",
  "amountIn": "100.00",
  "targetPrice": "0.92",
  "condition": "LTE"
}
```
* `tokenIn` / `tokenOut` — Token symbols
* `amountIn` — Amount to swap when triggered
* `targetPrice` — Price threshold for execution
* `condition` — `"LTE"` (price ≤ target) or `"GTE"` (price ≥ target)

### Cancel Limit Order
```
POST /v1/actions/wealth/limitOrder/cancel
```
```json
{ "id": "<uuid>" }
```

### Register DCA Schedule
```
POST /v1/actions/wealth/dca
```
```json
{
  "tokenIn": "USDC",
  "tokenOut": "cirBTC",
  "amountInPerTx": "25.00",
  "frequencyHours": 24,
  "totalOrders": 30
}
```
* `amountInPerTx` — USDC to swap per DCA execution
* `frequencyHours` — Hours between each automatic execution
* `totalOrders` — Required. Total number of recurring orders to execute before the schedule auto-completes. The schedule status transitions to `COMPLETED` once all orders have been executed.

### Cancel DCA Schedule
```
POST /v1/actions/wealth/dca/cancel
```
```json
{ "id": "<uuid>" }
```

### Multi-Yield Deposit (Aegis Vault + Synthra V3)
```
POST /v1/actions/wealth/multiYield
```
```json
{
  "amountUsdc": "100.00",
  "aegisWeight": 60,
  "synthraWeight": 40
}
```
* `amountUsdc` — Total USDC to allocate
* `aegisWeight` — % to Aegis aUSDC Vault (0–100)
* `synthraWeight` — % to Synthra V3 concentrated liquidity (0–100, max 80)
* Weights must add up to 100

### Withdraw from Synthra V3
```
POST /v1/actions/wealth/yield/synthra/withdraw
```
No body required. Closes the agent's active Synthra V3 position and collects all liquidity + fees.

---

## 4. Estimation Endpoints (No Nonce Required)

These return cost estimates without executing anything.

### Estimate Transfer Cost
```
POST /v1/actions/estimate/transfer
```
```json
{ "destination": "0x...", "amount": "10.00" }
```

### Estimate Swap
```
POST /v1/actions/swap/estimate
```
```json
{ "tokenIn": "USDC", "tokenOut": "EURC", "amount": "100.00" }
```

### Estimate Bridge Cost
```
POST /v1/actions/estimate/bridge
```
```json
{ "fromChain": "ARC-TESTNET", "toChain": "Ethereum_Sepolia", "amount": "50.00" }
```
* `fromChain` — Required. Source chain identifier
* `toChain` — Required. Destination chain identifier
* `amount` — USDC amount to bridge

### Get Bridge Fee Quote
```
POST /v1/actions/bridge/fee
```
```json
{ "fromChain": "ARC-TESTNET", "toChain": "Ethereum_Sepolia" }
```
* `fromChain` — Required. Source chain identifier
* `toChain` — Required. Destination chain identifier

### Check Bridge Status
```
POST /v1/actions/bridge/status
```
```json
{ "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" }
```

---

## 5. Marketplace (x402 Service Discovery)

### Search Services
```
POST /v1/marketplace/search
```
```json
{ "keyword": "weather", "category": "market-data", "limit": 10, "offset": 0 }
```
All fields optional. `limit` max 50.

### Inspect Service Pricing
```
POST /v1/marketplace/inspect
```
```json
{
  "serviceUrl": "https://api.example.com/v1/data",
  "method": "GET"
}
```
Returns x402 payment requirements without charging.

### Get Marketplace History
```
GET /v1/marketplace/history
```

---

## 6. Decision Framework

Before executing operations, evaluate:

1. **Bridging Efficiency**: Only bridge if expected yield > (bridging fees + target chain gas) × 1.5
2. **Micropayment Budget**: Do not pay for data if oracle cost > 2% of trade size (unless trade > 100 USDC)
3. **Always estimate first**: Call the estimate endpoints before executing swaps and bridges to verify costs
4. **Yield Strategy**: Default to `multiYield` for deposits, but ensure `synthraWeight` is ≤ 80%.
5. **Async Actions**: After executing a bridge, ALWAYS poll `GET /v1/actions/status/:auditId` until `status` is `SUCCESS` or `FAILED`. Report the final `txHash` to the user.

---

## 7. Error Recovery Playbook

If an API call fails, read the `code` in the JSON response:

| Error Code | HTTP | What Happened | What To Do |
| :--- | :--- | :--- | :--- |
| `UNAUTHORIZED` | 401 | Token invalid/expired/missing | Inform the user and ask them to re-authenticate via `/connect/start` |
| `NONCE_REQUIRED` | 400 | Missing `X-Aegis-Nonce` header | Fetch `GET /actions/nonce` and silently retry |
| `NONCE_MISMATCH` | 409 | Your nonce doesn't match server | Fetch `GET /actions/nonce` and silently retry |
| `INVALID_IDEMPOTENCY_FORMAT` | 400 | Key is not UUID v4 | Generate a proper UUID v4 string and retry |
| `POLICY_VIOLATION` | 403 | Exceeds spending limits | Tell the user: "This exceeds my policy limits. Would you like to do a smaller amount?" |
| `WALLET_NOT_PROVISIONED` | 409 | Wallet not yet created | Instruct the user to complete onboarding |
| `BRIDGE_UNSUPPORTED_CHAIN` | 400 | Invalid chain name | Fetch `GET /actions/bridge/chains` for valid names |
| `INVALID_YIELD_WEIGHTS` | 400 | Bad allocation weights | Fix the weights to sum to 100, ensure Synthra <= 80, and retry |
| `429` | 429 | Rate limited | Wait 60 seconds, then retry automatically |

---

## 8. Complete Example: Authentication → Balance Check → Yield Deposit

**Goal**: Onboard a new agent, check the wallet, and deposit idle USDC into the yield vault.

### Step 1 — Agent calls `/connect/start`
```
POST /v1/connect/start
Body: { "email": "agent@example.com" }
→ { "challengeId": "550e8400-...", "expiresAt": "..." }
```

### Step 2 — Agent STOPS and asks the user for the OTP
> **You MUST pause here.** Tell the user:
> *"I've started the connection challenge. A 6-character hex code has been sent to agent@example.com. Please check your email and share the code with me."*
>
> Wait for the user to respond. Do NOT proceed without their input.

### Step 3 — User provides OTP, agent completes challenge
The user replies with `A8F93D`. Now you call:
```
POST /v1/connect/complete
Body: { "email": "agent@example.com", "challengeId": "550e8400-...", "otp": "A8F93D" }
→ { "token": "aegis_live_wzm79d9...", "agent": { "walletAddress": "0xc275..." } }
```
Save the token. It is shown only once.

### Step 4 — Check balance
```
GET /v1/actions/balance
Headers: Authorization + X-Aegis-Email
→ { "balance": [{ "symbol": "USDC", "amount": "100.00" }] }
```
Tell the user: *"Your wallet has 100.00 USDC on Arc Testnet."*

### Step 5 — Suggest yield deposit and ASK for consent
You notice idle USDC. Tell the user:
> *"You have 100.00 USDC sitting idle. I can deposit some into the Aegis Yield Vault to earn auto-compounding yield. Would you like me to deposit, say, 50 USDC?"*
>
> Wait for the user to confirm. Do NOT execute without their approval.

### Step 6 — Fetch nonce + execute deposit
User says "yes, do 50". Now follow the mutation handshake:
```
# 6a. Fetch nonce
GET /v1/actions/nonce
→ { "nonce": 0 }

# 6b. Execute deposit (MUTATION — needs handshake headers)
POST /v1/actions/yield/deposit
Headers:
  Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
  X-Aegis-Nonce: 0
Body: { "amount": "50.00" }
→ { "action": "YIELD_DEPOSIT", "amount": "50.00", "txHash": "0x123abc...", "status": "COMPLETE" }
```

### Step 7 — Confirm to user
Tell the user:
> *"Done! I deposited 50.00 USDC into the Aegis Yield Vault. Your remaining wallet balance is 50.00 USDC and your yield position is now earning auto-compounding returns. Transaction: 0x123abc..."*
