import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { config, isProduction } from '../config.js';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });
const prismaLogLevels: Prisma.LogLevel[] = isProduction() ? ['error', 'warn'] : ['error', 'warn', 'info'];

export const db = globalForPrisma.prisma || new PrismaClient({ adapter, log: prismaLogLevels });

if (!isProduction()) globalForPrisma.prisma = db;

void db.$connect().catch((e: unknown) => {
  logger.error({ error: e }, 'Failed to connect to the database');
  if (isProduction()) {
    process.exit(1);
  }
});
