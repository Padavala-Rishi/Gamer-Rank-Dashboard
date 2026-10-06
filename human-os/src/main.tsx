import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/polish.css";
import { App } from "./App";
import { ApiError } from "./lib/api";
import { IS_EMBED, IS_LOCAL } from "./lib/mode";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// The preview runs inside a frame where the address bar can't change, so it routes in memory.
const Router = IS_EMBED ? MemoryRouter : BrowserRouter;
if (IS_LOCAL) window.addEventListener("hos:data-changed", () => queryClient.invalidateQueries());
if (IS_LOCAL && !IS_EMBED && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
