import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

// jsdom does not load the stylesheets React waits for in HeadContent.
// Keep the real router, root shell, provider and page components in this test.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  HeadContent: () => null,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ arquivos: [], pasta: "Test outputs" }),
    }),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPA text inputs", () => {
  it("closes the layout menu when a workspace modal opens and blocks reopening until dismissal", async () => {
    let enableDevelopmentMode: (value: { enabled: boolean }) => void = () => {};
    const developmentStatus = new Promise<{ enabled: boolean }>((resolve) => {
      enableDevelopmentMode = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (url) => ({
      ok: true,
      json: () => String(url).endsWith('/api/dev/release/status')
        ? developmentStatus
        : Promise.resolve({
          pasta: 'Test outputs',
          arquivos: [{
            arquivo: '000001 - Empresa Alfa.pdf', chave: '1'.repeat(44),
            layout: 'danfe', bytes: 100, atualizadoEm: '2026-10-19T12:00:00Z',
            url: '/arquivos/PDF/original.pdf',
          }, {
            arquivo: '000001 - Empresa Alfa - DANFE Etiqueta.pdf', chave: '1'.repeat(44),
            layout: 'etiqueta', layoutLabel: 'DANFE Etiqueta', bytes: 100,
            atualizadoEm: '2026-10-19T12:00:00Z', url: '/arquivos/.LAYOUTS/etiqueta/nota.pdf',
          }],
        }),
    } as Response));
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/saidas'] }),
      context: { queryClient: new QueryClient() },
    });
    render(<RouterProvider router={router} />);
    const layoutsButton = await screen.findByRole('button', { name: 'Layouts do DANFE' });
    expect(screen.getByText('1 PDF salvo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arquivos gerados 1' })).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText('1 PDF')).toBeInTheDocument();
    fireEvent.click(layoutsButton);
    expect(screen.getByRole('menu', { name: 'Layouts do DANFE' })).toBeInTheDocument();

    await act(async () => enableDevelopmentMode({ enabled: true }));
    const notice = await screen.findByRole('dialog', { name: 'Modo de desenvolvimento habilitado' });
    expect(screen.queryByRole('menu', { name: 'Layouts do DANFE' })).not.toBeInTheDocument();
    expect(layoutsButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(layoutsButton);
    expect(screen.queryByRole('menu', { name: 'Layouts do DANFE' })).not.toBeInTheDocument();

    fireEvent.click(within(notice).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('menu', { name: 'Layouts do DANFE' })).not.toBeInTheDocument();
    fireEvent.click(layoutsButton);
    expect(screen.getByRole('menu', { name: 'Layouts do DANFE' })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Sobre o DANFE'));
    expect(screen.getByRole('dialog', { name: 'Sobre o DANFE' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Layouts do DANFE' })).not.toBeInTheDocument();
  });

  it("keeps the workspace inside its React mount and accepts text across routes", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
      context: { queryClient: new QueryClient() },
    });
    const { container } = render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { name: "Processamento em lote" });
    // A document-level html/body shell reuses nodes outside the SPA mount and
    // creates a cycle in React's focus event traversal. Check before focusing.
    expect(container).toContainElement(screen.getByRole("main"));
    expect(container.querySelector("html, head, body")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Colar texto" }));
    const notes = screen.getByRole("textbox", { name: "Conteúdo das notas" });
    notes.focus();
    fireEvent.change(notes, { target: { value: "Texto de teste" } });
    expect(notes).toHaveFocus();
    expect(notes).toHaveValue("Texto de teste");

    fireEvent.click(screen.getByRole("link", { name: "Consulta rápida" }));
    const company = await screen.findByPlaceholderText("Nome da empresa");
    company.focus();
    fireEvent.change(company, { target: { value: "Empresa de teste" } });
    expect(company).toHaveFocus();
    expect(company).toHaveValue("Empresa de teste");

    fireEvent.click(screen.getByRole("link", { name: /Arquivos gerados/ }));
    const files = await screen.findByRole("searchbox", { name: "Buscar arquivos PDF" });
    files.focus();
    fireEvent.change(files, { target: { value: "PDF de teste" } });
    expect(files).toHaveFocus();
    expect(files).toHaveValue("PDF de teste");

    fireEvent.click(screen.getByRole("link", { name: "Terminal de logs" }));
    const logs = await screen.findByRole("textbox", { name: "Buscar logs" });
    logs.focus();
    fireEvent.change(logs, { target: { value: "Log de teste" } });
    expect(logs).toHaveFocus();
    expect(logs).toHaveValue("Log de teste");
  });
});
