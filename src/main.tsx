import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from '@/lib/query-client';
import { createAppRouter, wireAuth } from '@/router';
import { guardViewTransitions } from '@/lib/view-transitions';
import './index.css';

guardViewTransitions(document);

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

// A 401 clears the token or ends the console session (see api/client.ts);
// re-run route guards so the user lands on the sign-in screen, with the page
// they were on kept to return to, instead of a page full of errors.
wireAuth(router, queryClient);

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
