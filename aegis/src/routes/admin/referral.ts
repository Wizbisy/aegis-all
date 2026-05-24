import { Hono } from 'hono';

export const adminReferralRouter = new Hono();

adminReferralRouter.get('/', (c) => c.json({
  success: true,
  referrals: [],
  message: 'Referral tracking is not enabled yet',
}));
