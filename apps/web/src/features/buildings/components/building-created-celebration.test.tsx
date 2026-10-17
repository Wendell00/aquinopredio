import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildingCreatedCelebration } from "./building-created-celebration";

function renderAt(searchParams: string, onUrlUpdate = vi.fn()) {
  render(<BuildingCreatedCelebration />, {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate, hasMemory: true }),
  });
  return onUrlUpdate;
}

describe("BuildingCreatedCelebration", () => {
  afterEach(() => vi.useRealTimers());

  it("comemora em tela cheia logo depois do cadastro do prédio", () => {
    renderAt("?cadastro=predio");

    expect(screen.getByRole("dialog", { name: "Prédio cadastrado!" })).toBeInTheDocument();
    expect(screen.getByText("Você já pode anunciar e convidar os vizinhos.")).toBeInTheDocument();
  });

  it("não aparece fora do fluxo de cadastro", () => {
    renderAt("");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("some e limpa a URL ao clicar em Começar", async () => {
    const onUrlUpdate = renderAt("?cadastro=predio");

    await userEvent.click(screen.getByRole("button", { name: "Começar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onUrlUpdate).toHaveBeenCalledWith(expect.objectContaining({ queryString: "" }));
  });

  it("sai sozinha depois de alguns segundos", () => {
    vi.useFakeTimers();
    renderAt("?cadastro=predio");

    act(() => vi.advanceTimersByTime(5500));
    act(() => vi.runAllTimers());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
