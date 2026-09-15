import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EstadoMetabuscador } from "@az/core";
import { cotizacionVerificada } from "@az/core/fixtures";
import { ComparacionMetabuscador } from "./ComparacionMetabuscador";

const kayak = { id: "kayak" as const, nombre: "Kayak" };
const busquedaId = cotizacionVerificada.busquedaId;

const leida: EstadoMetabuscador = {
  metabuscador: kayak,
  enCurso: false,
  lecturas: [
    {
      id: "7c1e0d2c-9a8f-4c7d-8e6b-3a2f1c0d9e8f",
      busquedaId,
      metabuscador: kayak,
      origenIata: "ASU",
      destinoIata: "MAD",
      fechaIda: cotizacionVerificada.fechaIda,
      fechaVuelta: cotizacionVerificada.fechaVuelta,
      estado: "leida",
      totalOfertas: 486,
      ofertas: [
        { posicion: 1, aerolineas: ["Iberia"], precio: { montoOriginal: 902, monedaOriginal: "USD", montoUsd: 902, fx: null }, tarifa: "Economy", tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "23:55", llegada: "16:10", desfaseDias: 1, escalas: 0, viaIatas: [], duracionMin: 735 }], transbordoPorCuentaPropia: false, etiquetas: ["Best"], textoCrudo: "x" },
        { posicion: 2, aerolineas: ["GOL", "Air Europa"], precio: { montoOriginal: 664, monedaOriginal: "USD", montoUsd: 664, fx: null }, tarifa: null, tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "12:45", llegada: "13:50", desfaseDias: 1, escalas: 2, viaIatas: ["GIG", "LIS"], duracionMin: 1265 }], transbordoPorCuentaPropia: true, etiquetas: ["Cheapest"], textoCrudo: "y" },
      ],
      evidencia: { url: "https://www.kayak.com/flights/ASU-MAD/2027-01-01", capturadoEn: "2026-09-14T12:00:00.000Z", screenshotPath: `${busquedaId}/kayak/1.png`, selector: ".nrc6", textoCrudo: "x" },
    },
    { id: "8c1e0d2c-9a8f-4c7d-8e6b-3a2f1c0d9e8f", busquedaId, metabuscador: kayak, origenIata: "ASU", destinoIata: "MAD", fechaIda: "2027-01-02", fechaVuelta: null, estado: "bloqueado", motivo: "captcha: Elemento div#px-captcha", evidencia: { url: null, capturadoEn: "2026-09-14T12:01:00.000Z", screenshotPath: null } },
  ],
};

const respuesta = (cuerpo: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ComparacionMetabuscador", () => {
  it("sin metabuscadores no muestra nada", () => {
    const { container } = render(<ComparacionMetabuscador busquedaId={busquedaId} metabuscadores={[]} cotizaciones={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("pide la lectura, sondea hasta que termina y muestra ofertas con el delta contra el precio oficial", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta({ metabuscador: kayak, enCurso: false, lecturas: [] })) // estado inicial
      .mockResolvedValueOnce(respuesta({ metabuscador: kayak, enCurso: true, lecturas: [] })) // POST
      .mockResolvedValueOnce(respuesta(leida)); // sondeo
    vi.stubGlobal("fetch", fetchMock);
    render(<ComparacionMetabuscador busquedaId={busquedaId} metabuscadores={[kayak]} cotizaciones={[cotizacionVerificada]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Comparar con Kayak" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Comparar con Kayak" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Leyendo Kayak"));
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/busquedas/${busquedaId}/metabuscadores/kayak`, { method: "POST" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Volver a leer" })).toBeTruthy());
    expect(screen.getByText(/486 vuelos en Kayak, se guardaron 2/)).toBeTruthy();
    const oficial = cotizacionVerificada.precio.montoUsd; // 841,23 en el fixture; formatearEntero redondea hacia arriba
    expect(screen.getByTestId("delta").textContent).toBe(`Oficial USD 842 (Iberia) · metabuscador USD 664 (GOL, Air Europa): -177 USD (-${Math.round(((oficial - 664) / oficial) * 100)} %)`);
    expect(screen.getByText("transbordo por cuenta propia")).toBeTruthy();
    expect(screen.getByText(/2 escalas \(GIG, LIS\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "captura" }).getAttribute("href")).toBe(`/api/evidencia/${busquedaId}/kayak/1.png`);
    expect(screen.getByText(/02\/01\/2027 · bloqueado: captcha/)).toBeTruthy();
  });
});
