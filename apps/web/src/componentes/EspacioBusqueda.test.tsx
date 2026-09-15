import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Aeropuerto } from "@az/core";
import type { ResultadoEspacio } from "@az/espacio";
import { EspacioBusqueda } from "./EspacioBusqueda";

const aeropuertos: Aeropuerto[] = [
  { iata: "EZE", nombre: "Ministro Pistarini International Airport", ciudad: "Buenos Aires", pais: "Argentina" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid–Barajas Airport", ciudad: "Madrid", pais: "Spain" },
  { iata: "MVD", nombre: "Carrasco International Airport", ciudad: "Montevideo", pais: "Uruguay" },
];

const geo = (iata: string, pais: string) => ({ iata, icao: null, nombre: iata, ciudad: iata, pais, lat: 0, lon: 0, tipo: "grande" as const, servicioRegular: true });

const resultado: ResultadoEspacio = {
  origen: "EZE",
  destino: "MAD",
  calculadoEn: "2026-09-14T15:00:00.000Z",
  origenes: [
    { aeropuerto: geo("EZE", "AR"), rol: "origen", esSolicitado: true, distanciaKm: 0, salidasSemanales: 75, posicion: 1 },
    { aeropuerto: geo("MVD", "UY"), rol: "origen", esSolicitado: false, distanciaKm: 229, salidasSemanales: 23, posicion: 2 },
  ],
  destinos: [{ aeropuerto: geo("MAD", "ES"), rol: "destino", esSolicitado: true, distanciaKm: 0, salidasSemanales: 324, posicion: 1 }],
  rutas: {
    conservadas: [{ origen: "EZE", destino: "MAD", aerolineas: ["AR", "IB", "UX"], vuelosSemanales: 21, escalas: 0, via: null, nivel: 1, etiquetaNivel: "Máxima", fuente: "dataset", confianza: 0.7, tramoPrevio: null }],
    descartadas: [{ origen: "EZE", destino: "MAD", aerolineas: ["AF"], vuelosSemanales: 4, escalas: 1, via: "CDG", nivel: 3, etiquetaNivel: "Media", fuente: "dataset", confianza: 0.5, tramoPrevio: null }],
    separadas: [],
  },
  gaps: [
    { aerolinea: "TK", nombre: "Turkish Airlines", operaEn: ["EZE"], cubreRutasObjetivo: true, hipotesis: "EZE→IST→destino. Vía IST", hub: "IST", prioridad: "alta", requiereBoletosSeparados: false, necesitaVerificacion: true, estado: "pendiente", rol: "gap_origen" },
    { aerolinea: "VY", nombre: "Vueling", operaEn: ["MAD"], cubreRutasObjetivo: false, hipotesis: "Feeder de destino", hub: null, prioridad: "media", requiereBoletosSeparados: true, necesitaVerificacion: false, estado: "sin_verificar", rol: "feeder_destino" },
  ],
  nombres: [
    { iata: "AF", nombre: "Air France" },
    { iata: "AR", nombre: "Aerolineas Argentinas" },
    { iata: "IB", nombre: "Iberia Airlines" },
    { iata: "UX", nombre: "Air Europa" },
  ],
};

const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

const responder = (cuerpo: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(cuerpo) } as unknown as Response);

afterEach(() => vi.unstubAllGlobals());

describe("EspacioBusqueda", () => {
  it("valida origen y destino antes de consultar", () => {
    const fetchMock = responder(resultado);
    vi.stubGlobal("fetch", fetchMock);
    render(<EspacioBusqueda aeropuertos={aeropuertos} adaptadores={new Set(["AR"])} hoy="2026-09-14" onVerificar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar espacio" }));
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual(["Elegí un aeropuerto de origen", "Elegí un aeropuerto de destino"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta la API y muestra aeropuertos, rutas por nivel y gaps", async () => {
    vi.stubGlobal("fetch", responder(resultado));
    render(<EspacioBusqueda aeropuertos={aeropuertos} adaptadores={new Set(["AR"])} hoy="2026-09-14" onVerificar={vi.fn()} />);
    elegir("Origen", "eze", /EZE — Ministro/);
    elegir("Destino", "mad", /MAD — Adolfo/);
    fireEvent.click(screen.getByRole("button", { name: "Explorar espacio" }));

    await waitFor(() => expect(screen.getByTestId("resumen-espacio")).toBeTruthy());
    expect(screen.getByTestId("resumen-espacio").textContent).toContain("2 orígenes · 1 destinos · 1 rutas Nivel 1–2 (1 pares) · 1 persistidas Nivel 3–4 · 0 boletos separados · 2 gaps");
    expect(screen.getByText("MVD · 229 km")).toBeTruthy();
    expect(screen.getByText("N1 Máxima")).toBeTruthy();
    expect(screen.getByTitle("Aerolineas Argentinas").textContent).toContain("adaptador");
    expect(screen.getByTitle("Iberia Airlines").textContent).not.toContain("adaptador");
    expect(screen.getByText("TK — Turkish Airlines")).toBeTruthy();
    expect(screen.getByText("pendiente de verificar")).toBeTruthy();
    expect(screen.getByText("boletos separados")).toBeTruthy();

    // Las Nivel 3–4 sólo se muestran a pedido.
    expect(screen.queryByText("N3 Media")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Mostrar Nivel 3–4 persistidas \(1\)/));
    expect(screen.getByText("N3 Media")).toBeTruthy();
    expect(screen.getByText("CDG")).toBeTruthy();
  });

  it("muestra el error de la API sin inventar resultados", async () => {
    vi.stubGlobal("fetch", responder({ error: "El aeropuerto MVD no está en el dataset" }, false, 404));
    render(<EspacioBusqueda aeropuertos={aeropuertos} adaptadores={new Set()} hoy="2026-09-14" onVerificar={vi.fn()} />);
    elegir("Origen", "eze", /EZE — Ministro/);
    elegir("Destino", "mvd", /MVD — Carrasco/);
    fireEvent.click(screen.getByRole("button", { name: "Explorar espacio" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("El aeropuerto MVD no está en el dataset"));
    expect(screen.queryByTestId("resumen-espacio")).toBeNull();
  });

  it("permite volver a teclear sobre un aeropuerto ya elegido sin que se borre el texto", () => {
    vi.stubGlobal("fetch", responder(resultado));
    render(<EspacioBusqueda aeropuertos={aeropuertos} adaptadores={new Set()} hoy="2026-09-14" onVerificar={vi.fn()} />);
    elegir("Origen", "eze", /EZE — Ministro/);
    const input = screen.getByRole("combobox", { name: "Origen" });
    fireEvent.change(input, { target: { value: "mvd" } });
    expect((input as HTMLInputElement).value).toBe("mvd");
    expect(screen.getByRole("option", { name: /MVD — Carrasco/ })).toBeTruthy();
  });
});
