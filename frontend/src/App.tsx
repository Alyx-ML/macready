import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GameDB } from "./components/GameDB";
import { SmoothScroll } from "./components/SmoothScroll";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScroll />
      <GameDB />
    </QueryClientProvider>
  );
}
