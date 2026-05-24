import { Hono } from 'hono';
import { listYieldVaults, getVaultState, reconcileYieldSettlements } from '../../services/yield/index.js';
import { fail } from '../../utils/response.js';

export const adminYieldRouter = new Hono();

adminYieldRouter.get('/vaults', (c) => c.json({ success: true, vaults: listYieldVaults() }));

adminYieldRouter.get('/state', async (c) => {
  try {
    const state = await getVaultState();
    return c.json({ success: true, vault: state });
  } catch (err) {
    return fail(c, err);
  }
});

import { runYieldDistributor } from '../../services/yield/distributor.js';

adminYieldRouter.post('/reconcile', async (c) => {
  try {
    const result = await reconcileYieldSettlements();
    return c.json({ success: true, result });
  } catch (err) {
    return fail(c, err);
  }
});

adminYieldRouter.post('/distribute', async (c) => {
  try {
    const pk = process.env.YIELD_ADMIN_PRIVATE_KEY as `0x${string}`;
    if (!pk) throw new Error('YIELD_ADMIN_PRIVATE_KEY is not set in .env');

    const result = await runYieldDistributor(pk, 0.02); 
    return c.json({ success: true, result });
  } catch (err) {
    return fail(c, err);
  }
});
