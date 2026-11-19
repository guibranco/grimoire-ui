import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './router';
import { routerBasename } from './lib/routes';
import { api } from './lib/api';
import { invalidateDashboardOnMutations } from './lib/dashboard';

const router = createBrowserRouter(routes, { basename: routerBasename() });

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

const queryClient = createQueryClient();
invalidateDashboardOnMutations(api, queryClient);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" toastOptions={{
        style: {
          background: '#1C1C1F',
          color: '#F1F1F1',
          border: '1px solid #27272A',
          borderRadius: '0px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
        },
      }} />
    </QueryClientProvider>
  );
}
