import { Hono } from 'hono';

export const adminAuthRouter = new Hono();

adminAuthRouter.get('/session', (c) => c.json({ success: true, authenticated: true }));
