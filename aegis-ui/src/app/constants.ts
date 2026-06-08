export const skillUrl = 'https://api.aegisintent.xyz/SKILL.md';
export const docsUrl = 'https://docs.aegisintent.xyz';

export const displayFont = 'var(--font-display-family), var(--font-plus-jakarta), sans-serif';

export const pipeline = [
  {
    step: '01',
    label: 'Connect',
    title: 'Integrate SKILL.md',
    body: 'Provide your AI agent with the public SKILL.md API resource instructions. The agent will parse platform rules, schemas, and action constraints to negotiate transactions natively.',
  },
  {
    step: '02',
    label: 'Authorize',
    title: 'Agent Authorization',
    body: 'Link agent access seamlessly through secure, temporary session tokens. Authorize wallets safely without exposing master private keys.',
  },
  {
    step: '03',
    label: 'Execute',
    title: 'Execute with Guardrails',
    body: 'Run transactions with complete confidence. The Aegis Policy Engine verifies every single action against your active rules, instantly rejecting unauthorized operations.',
  },
];

export const capabilities = [
  {
    title: 'x402 payment execution',
    body: 'Agents can discover paid APIs, inspect payment requirements, and pay with USDC through a single guarded action.',
    tag: 'Marketplace',
  },
  {
    title: 'Wealth Sentinel',
    body: 'Background automation monitors limit orders and DCA schedules, then executes matching intents when conditions are met.',
    tag: 'Automation',
  },
  {
    title: 'Multi-yield allocation',
    body: 'Idle USDC can be split between the Aegis aUSDC Vault and Synthra V3 concentrated liquidity positions.',
    tag: 'Yield',
  },
  {
    title: 'Cross-chain liquidity',
    body: 'CCTP support lets agents bridge USDC across supported testnets while keeping policy checks in front of execution.',
    tag: 'CCTP',
  },
];

export const policyRows = [
  { field: 'perTxLimitUsdc', limit: '$10,000.00', scope: 'Enforced on every transaction action request.' },
  { field: 'dailyLimitUsdc', limit: '$50,000.00', scope: 'Rolling 24-hour aggregate volume control.' },
  { field: 'weeklyLimitUsdc', limit: '$200,000.00', scope: 'Rolling 7-day aggregate volume control.' },
  { field: 'monthlyLimitUsdc', limit: '$500,000.00', scope: 'Rolling 30-day aggregate volume control.' },
];

export const executionRoute = ['Auth', 'Idempotency', 'Policy', 'Circle DCW', 'Audit'];
