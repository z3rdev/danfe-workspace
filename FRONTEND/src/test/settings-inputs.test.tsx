import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/components/danfe/settings";
import { requestJson } from "@/components/danfe/store";

vi.mock("@/components/danfe/store", () => ({
  requestJson: vi.fn(),
  apiUrl: (path: string) => path,
  useDanfe: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const savedSettings = {
  autoStartWindows: false,
  outputDir: "C:\\DANFE",
  defaultOutputDir: "C:\\DANFE",
  batchSize: 60,
  batchIntervalMs: 1500,
  batchPauseMs: 5000,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestJson).mockImplementation(async (_url, options) =>
    options?.method === "POST" ? JSON.parse(String(options.body)) : savedSettings,
  );
});
afterEach(cleanup);

async function openSettings() {
  render(<SettingsPage />);
  return screen.findByRole("spinbutton", { name: /Pausa entre lotes/ });
}

function savedPayload() {
  const call = vi.mocked(requestJson).mock.calls.find(([, options]) => options?.method === "POST");
  return JSON.parse(String(call?.[1]?.body));
}

describe("Batch settings input", () => {
  it.each(["10", "15"])(
    "allows clearing and typing %s seconds one digit at a time",
    async (value) => {
      const pause = await openSettings();
      fireEvent.change(pause, { target: { value: "" } });
      expect(pause).toHaveValue(null);
      fireEvent.change(pause, { target: { value: "1" } });
      expect(pause).toHaveValue(1);
      fireEvent.change(pause, { target: { value } });
      fireEvent.blur(pause);
      expect(pause).toHaveValue(Number(value));

      fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
      await waitFor(() => expect(savedPayload().batchPauseMs).toBe(Number(value) * 1000));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Salvar configurações" })).toBeEnabled(),
      );
    },
  );

  it("keeps draft values for all numeric fields and saves numbers in backend units", async () => {
    await openSettings();
    const size = screen.getByRole("spinbutton", { name: /Notas por lote/ });
    const interval = screen.getByRole("spinbutton", { name: /Intervalo entre consultas/ });
    fireEvent.change(size, { target: { value: "" } });
    expect(size).toHaveValue(null);
    fireEvent.change(size, { target: { value: "1" } });
    expect(size).toHaveValue(1);
    fireEvent.change(size, { target: { value: "15" } });
    fireEvent.change(interval, { target: { value: "" } });
    expect(interval).toHaveValue(null);
    fireEvent.change(interval, { target: { value: "0" } });
    expect(interval).toHaveValue(0);
    fireEvent.change(interval, { target: { value: "0.5" } });

    // Save must also commit a draft without relying on a prior blur event.
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    await waitFor(() =>
      expect(savedPayload()).toMatchObject({
        batchSize: 15,
        batchIntervalMs: 500,
        batchPauseMs: 5000,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salvar configurações" })).toBeEnabled(),
    );
  });

  it("applies limits only when leaving a field or saving and restores empty values", async () => {
    const pause = await openSettings();
    fireEvent.change(pause, { target: { value: "15" } });
    fireEvent.blur(pause);
    fireEvent.change(pause, { target: { value: "" } });
    expect(pause).toHaveValue(null);
    fireEvent.blur(pause);
    expect(pause).toHaveValue(15);
    fireEvent.change(pause, { target: { value: "1" } });
    expect(pause).toHaveValue(1);
    fireEvent.blur(pause);
    expect(pause).toHaveValue(5);

    fireEvent.change(pause, { target: { value: "999" } });
    expect(pause).toHaveValue(999);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Notas por lote/ }), {
      target: { value: "999" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /Intervalo entre consultas/ }), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    await waitFor(() =>
      expect(savedPayload()).toMatchObject({
        batchSize: 100,
        batchIntervalMs: 10000,
        batchPauseMs: 120000,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salvar configurações" })).toBeEnabled(),
    );
    expect(pause).toHaveValue(120);
  });
});
