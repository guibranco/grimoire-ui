import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/router';

export type TestRouter = ReturnType<typeof createMemoryRouter>;

/** Renders the app's routes at `path` with a fresh query client (no retries). */
export function renderAt(path = '/'): TestRouter {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

/** Current path plus query string. */
export const pathOf = (router: TestRouter) => router.state.location.pathname + router.state.location.search;
