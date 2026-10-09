import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthChange } from '@/lib/auth';
import { createQueryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';
import './index.css';

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

// A 401 clears the token (see api/client.ts); re-run route guards so the user
// lands on the login screen instead of a page full of errors.
onAuthChange(() => {
  void router.invalidate();
});

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
