import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutputsPage } from "@/components/danfe/outputs";
import { useDanfe } from "@/components/danfe/store";
import type { Output } from "@/lib/danfe";

vi.mock("@/components/danfe/store", () => ({ useDanfe: vi.fn() }));

const files: Output[] = Array.from({ length: 23 }, (_, index) => ({
  id: `pdf-${index + 1}`,
  number: String(index + 1).padStart(6, "0"),
  company: index < 11 ? "Empresa Alfa" : "Empresa Beta",
  key: "",
  format: "PDF",
  time: "12:00",
  size: "10 KB",
}));

function setOutputs(outputs: Output[]) {
  vi.mocked(useDanfe).mockReturnValue({
    outputs,
    outputFolder: "Test outputs",
    refreshOutputs: vi.fn(),
    serviceOnline: true,
  } as unknown as ReturnType<typeof useDanfe>);
}

function clickPage(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function rows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

beforeEach(() => {
  setOutputs([
    ...files,
    { ...files[0]!, id: "xml-1", format: "XML" },
    { ...files[0]!, id: "json-1", format: "JSON" },
  ]);
});

afterEach(cleanup);

describe("Output pagination", () => {
  it("navigates between PDF pages with correct ranges and boundary buttons", () => {
    render(<OutputsPage />);
    expect(rows()).toHaveLength(10);
    expect(screen.getByText("1–10 de 23 PDFs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Primeira página" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();

    clickPage("Próxima página");
    expect(screen.getByText("11–20 de 23 PDFs")).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent("000011");
    expect(screen.queryByText(/000001 -/)).not.toBeInTheDocument();

    clickPage("Última página");
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("21–23 de 23 PDFs")).toBeInTheDocument();
    expect(screen.getByText("Página 3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Última página" })).toBeDisabled();

    clickPage("Página anterior");
    expect(screen.getByText("11–20 de 23 PDFs")).toBeInTheDocument();
    clickPage("Primeira página");
    expect(screen.getByText("1–10 de 23 PDFs")).toBeInTheDocument();
  });

  it("resets pagination when searching, clearing or changing page size, including no results", () => {
    render(<OutputsPage />);
    const search = screen.getByRole("searchbox", { name: "Buscar arquivos PDF" });
    clickPage("Última página");
    fireEvent.change(search, { target: { value: "Alfa" } });
    expect(screen.getByText("1–10 de 11 PDFs")).toBeInTheDocument();
    clickPage("Próxima página");
    expect(screen.getByText("11–11 de 11 PDFs")).toBeInTheDocument();
    clickPage("Limpar pesquisa");
    expect(screen.getByText("1–10 de 23 PDFs")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Alfa" } });
    clickPage("Próxima página");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.getByText("1–10 de 23 PDFs")).toBeInTheDocument();
    clickPage("Última página");
    fireEvent.change(screen.getByRole("combobox", { name: "Arquivos por página" }), {
      target: { value: "25" },
    });
    expect(rows()).toHaveLength(23);
    expect(screen.getByText("1–23 de 23 PDFs")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Não existe" } });
    expect(screen.getByText("Nenhum PDF encontrado.")).toBeInTheDocument();
    expect(screen.getByText("0–0 de 0 PDFs")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
  });

  it("shares the current page between list and grid and clamps it when files are removed", () => {
    const { rerender } = render(<OutputsPage />);
    clickPage("Próxima página");
    clickPage("Visualizar grade");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Visualizar" })).toHaveLength(10);
    expect(screen.getByText("000011 - Empresa Alfa")).toBeInTheDocument();
    expect(screen.queryByText("000001 - Empresa Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    clickPage("Visualizar lista");
    expect(rows()[0]).toHaveTextContent("000011");

    setOutputs(files.slice(0, 3));
    rerender(<OutputsPage />);
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("1–3 de 3 PDFs")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
  });
});
