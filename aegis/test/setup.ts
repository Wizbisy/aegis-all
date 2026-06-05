// test/setup.ts
// This file injects dummy environment variables into process.env before any tests run.
// This ensures that src/config.ts does not crash during CI/CD or local test runs
// when a .env file is missing or incomplete, since the tests are pure unit tests anyway.

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.ARC_CHAIN = 'ARC-TESTNET';
process.env.ARC_RPC_URL = 'https://rpc.example.com';
process.env.SYNTHRA_NFT_POSITION_MANAGER_ADDRESS = '0x0000000000000000000000000000000000000000';
process.env.SYNTHRA_PAIRED_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
process.env.SYNTHRA_PAIRED_TOKEN_DECIMALS = '6';
process.env.SYNTHRA_PAIRED_TOKEN_SYMBOL = 'USDC';
process.env.CIRCLE_DISCOVERY_API_URL = 'https://api.example.com';
process.env.ENTITY_SECRET = '12345678901234567890123456789012';
process.env.CIRCLE_USDC_TOKEN_ID = '123e4567-e89b-12d3-a456-426614174000';
process.env.RESEND_API_URL = 'https://api.example.com';
process.env.AUTH_EXEMPT_PATHS = '/health';
process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
