import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Pages must not go stale (UX-05): coming back to the tab refreshes
        // what is on screen; mutations invalidate what they change, and
        // running jobs poll (see api/queries.ts).
        refetchOnWindowFocus: true,
        // Don't hammer the API on auth/validation errors; retry transient ones once.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
      },
    },
  });
}
