import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getHealth } from "../api/get-health";
import { useHealth } from "./use-health";

vi.mock("../api/get-health", () => ({ getHealth: vi.fn() }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useHealth", () => {
  it("expõe o status da API", async () => {
    vi.mocked(getHealth).mockResolvedValue({
      status: "ok",
      database: "up",
      timestamp: "2026-10-12T12:00:00.000Z",
    });

    const { result } = renderHook(() => useHealth(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("ok");
  });

  it("expõe o erro quando a API falha", async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useHealth(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
