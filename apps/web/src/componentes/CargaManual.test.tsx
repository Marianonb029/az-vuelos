import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Busqueda, CotizacionManual } from "@az/core";
import { busquedaIda } from "@az/core/fixtures";
import { CargaManual } from "./CargaManual";
import { CotizacionesManuales } from "./CotizacionesManuales";
import { EstadoResultados } from "./EstadoResultados";
import { PendientesManual } from "./PendientesManual";

const pendiente: Busqueda = { ...busquedaIda, aerolineaIata: "LA", estado: "manual_pendiente", aviso: "LA no tiene adaptador: buscá el precio en su sitio oficial." };

const manual: CotizacionManual = {
  id: "5b1e0d2c-9a8f-4c7d-8e6b-3a2f1c0d9e8f",
  busquedaId: busquedaIda.id,
  aerolinea: { iata: "LA", nombre: "LATAM" },
  tipo: "ida",
  origenIata: "ASU",
  destinoIata: "MAD",
  fechaIda: "2027-01-02",
  fechaVuelta: null,
  estado: "verificado_manual",
  precio: { montoOriginal: 780, monedaOriginal: "EUR", montoUsd: 842, fx: { par: "EUR/USD", tasa: 1.0794, fuente: "ExchangeRate-API", capturadaEn: "2026-09-14T00:02:31.000Z" } },
  nota: "1 escala en GRU",
  evidencia: { url: "https://www.latamairlines.com/x", capturadoEn: "2026-09-14T12:00:00.000Z", screenshotPath: "manual/5b1e0d2c.png", cargadoEn: "2026-09-14T12:05:00.000Z" },
};

const llenar = (archivo: File | null) => {
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2027-01-02|" } });
  fireEvent.change(screen.getByLabelText("Monto publicado"), { target: { value: "780" } });
  fireEvent.change(screen.getByLabelText("Moneda"), { target: { value: "eur" } });
  fireEvent.change(screen.getByLabelText("URL de la página con el precio"), { target: { value: "https://www.latamairlines.com/x" } });
  fireEvent.change(screen.getByLabelText("Hora en que viste el precio"), { target: { value: "2026-09-14T09:00" } });
  fireEvent.change(screen.getByLabelText("Nota (itinerario, escalas, tarifa)"), { target: { value: "1 escala en GRU" } });
  if (archivo) fireEvent.change(screen.getByLabelText("Captura de pantalla (PNG o JPEG)"), { target: { files: [archivo] } });
};

afterEach(() => vi.unstubAllGlobals());

describe("CargaManual", () => {
  it("no envía nada si falta algún dato de evidencia", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onCargada = vi.fn();
    render(<CargaManual busqueda={pendiente} onCargada={onCargada} />);
    llenar(null);
    fireEvent.click(screen.getByRole("button", { name: "Registrar precio leído" }));
    expect(screen.getByRole("alert").textContent).toBe("Falta la captura de pantalla");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCargada).not.toHaveBeenCalled();
  });

  it("envía la captura en base64 con URL, monto, moneda y hora, y avisa al padre", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ busqueda: { ...pendiente, estado: "parcial", aviso: null }, cotizacion: manual }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onCargada = vi.fn();
    render(<CargaManual busqueda={pendiente} onCargada={onCargada} />);
    llenar(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "captura.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar precio leído" }));

    await waitFor(() => expect(onCargada).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/busquedas/${busquedaIda.id}/manual`);
    const cuerpo = JSON.parse(String(init.body)) as { fechaIda: string; fechaVuelta: null; monto: number; moneda: string; url: string; capturadoEn: string; nota: string; imagen: { tipo: string; base64: string } };
    expect(cuerpo).toMatchObject({ fechaIda: "2027-01-02", fechaVuelta: null, monto: 780, moneda: "EUR", url: "https://www.latamairlines.com/x", nota: "1 escala en GRU" });
    expect(cuerpo.capturadoEn).toBe(new Date("2026-09-14T09:00").toISOString());
    expect(cuerpo.imagen).toEqual({ tipo: "image/png", base64: "iVBORw==" });
    expect(onCargada).toHaveBeenCalledWith(expect.objectContaining({ estado: "parcial" }), manual);
  });

  it("muestra el error de la API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: "El archivo no es un PNG válido" }) } as unknown as Response));
    render(<CargaManual busqueda={pendiente} onCargada={vi.fn()} />);
    llenar(new File(["x"], "captura.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar precio leído" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("El archivo no es un PNG válido"));
  });
});

describe("EstadoResultados con carga manual", () => {
  it("manual_pendiente muestra la instrucción y el formulario", () => {
    render(<EstadoResultados busqueda={pendiente} cotizaciones={[]} onReintentar={() => {}} onCargaManual={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("LA no tiene adaptador");
    expect(screen.getByRole("form", { name: "Carga manual" })).toBeTruthy();
  });

  it("fallida ofrece cargar a mano; parcial lista lo verificado manualmente con su evidencia", () => {
    const { unmount } = render(<EstadoResultados busqueda={{ ...pendiente, estado: "fallida", motivoFallo: "selector no encontrado" }} cotizaciones={[]} onReintentar={() => {}} onCargaManual={() => {}} />);
    expect(screen.queryByRole("form", { name: "Carga manual" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cargar el precio a mano" }));
    expect(screen.getByRole("form", { name: "Carga manual" })).toBeTruthy();
    unmount();

    render(<EstadoResultados busqueda={{ ...pendiente, estado: "parcial", aviso: null }} cotizaciones={[manual]} onReintentar={() => {}} onCargaManual={() => {}} />);
    const seccion = screen.getByRole("region", { name: "Verificado manualmente" });
    expect(seccion.textContent).toContain("USD 842");
    expect(seccion.textContent).toContain("leído a mano");
    expect(seccion.textContent).toContain("1 escala en GRU");
    expect(screen.getByRole("link", { name: "ver captura" }).getAttribute("href")).toBe("/api/evidencia/manual/5b1e0d2c.png");
    expect(screen.getByText("Cargar a mano una fecha sin precio")).toBeTruthy();
  });
});

describe("PendientesManual y CotizacionesManuales", () => {
  it("lista las pendientes con motivo y abre la elegida", () => {
    const onAbrir = vi.fn();
    render(<PendientesManual pendientes={[pendiente, { ...busquedaIda, id: "2e9c4e4f-3a7b-4e1d-8d6b-2a3f4b5c6d7e", estado: "bloqueada" }]} nombres={new Map([["LA", "LATAM"]])} onAbrir={onAbrir} />);
    expect(screen.getByText("LA — LATAM")).toBeTruthy();
    expect(screen.getByText(/sin adaptador · pedida el/)).toBeTruthy();
    expect(screen.getByText(/bloqueó la automatización/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Cargar precio" })[0] as HTMLElement);
    expect(onAbrir).toHaveBeenCalledWith(pendiente);
  });

  it("con aerolínea visible ordena por USD", () => {
    render(<CotizacionesManuales cotizaciones={[{ ...manual, id: "a", precio: { ...manual.precio, montoUsd: 900 } }, { ...manual, id: "b" }]} mostrarAerolinea />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("USD 842");
    expect(items[0]).toContain("LATAM");
    expect(items[1]).toContain("USD 900");
  });
});
