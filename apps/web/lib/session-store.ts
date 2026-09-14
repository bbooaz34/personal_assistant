/**
 * Chooses the conversation store for this process (docs/DATA-COLLECTION.md).
 *
 * Mirrors `hasCredentials` in `lib/model.ts`: configuration decides whether a
 * capability exists, and its absence is a supported state rather than an error.
 * With no Supabase keys the app runs exactly as it did before any of this was
 * added — which keeps `git clone && npm run dev` working with no accounts.
 *
 * The service-role key is read here and never exported. It must not reach a
 * bundle that ships to a browser; this module is imported only by route
 * handlers, which run on the server.
 */

import './env';
import { NullStore, SupabaseStore, type SessionStore } from '@par/analytics';

let cached: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cached = new NullStore();
    return cached;
  }

  cached = new SupabaseStore({ url, serviceRoleKey: key });
  console.info('[store] conversation persistence enabled');
  return cached;
}
