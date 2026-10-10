import { useState } from 'react';
import type { Tenant } from '@/api/types';

/**
 * The tenant a settings form shows, including right after a save.
 *
 * `useUpdateTenant` writes the PATCH response to the query cache, but query
 * observers are notified a tick after the mutation's `onSuccess` runs. A form
 * that clears its draft in `onSuccess` would show the old values for a frame
 * between "Saving" and the saved values. Call `saved(after)` there instead:
 * the response is shown from that moment until the `tenant` prop catches up.
 */
export function useSavedTenant(tenant: Tenant) {
  const [saveResult, setSaveResult] = useState<{ before: Tenant; after: Tenant } | null>(null);
  const caughtUp = saveResult != null && saveResult.before !== tenant;
  if (caughtUp) setSaveResult(null);
  const current = saveResult && !caughtUp ? saveResult.after : tenant;
  return { current, saved: (after: Tenant) => setSaveResult({ before: tenant, after }) };
}
