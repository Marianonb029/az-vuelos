import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Aeropuerto, Busqueda } from "@az/core";
import { busquedaIda } from "@az/core/fixtures";
import type { Combinacion, ResultadoCombinaciones, ResultadoEspacio } from "@az/espacio";
import { BusquedaGuiada, aNuevasBusquedas } from "./BusquedaGuiada";

const aeropuertos: Aeropuerto[] = [
  { iata: "EZE", nombre: "Ministro Pistarini International Airport", ciudad: "Buenos Aires", pais: "Argentina" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid–Barajas Airport", ciudad: "Madrid", pais: "Spain" },
];
const geo = (iata: string, pais: string) => ({ iata, icao: null, nombre: iata, ciudad: iata, pais, lat: 0, lon: 0, tipo: "grande" as const, servicioRegular: true });
const comb = (id: string, aerolinea: string, puntaje: number, desde: string, hasta: string, origen = "EZE"): Combinacion => ({
  id,
  origen,
  destino: "MAD",
  aerolinea,
  nivelRuta: 1,
  via: null,
  ventanaIda: { desde, hasta },
  ventanaVuelta: null,
  puntaje,
  desglose: {},
  fundamento: "x",
  requiereTrasladoTerrestre: origen !== "EZE",
  notaTraslado: origen === "EZE" ? null : `salida desde ${origen}, a 229 km del pedido`,
  requiereBoletosSeparados: false,
  tramoPrevio: null,
  confianza: "alta",
});

const espacio: ResultadoEspacio = {
  origen: "EZE",
  destino: "MAD",
  calculadoEn: "2026-09-14T15:00:00.000Z",
  origenes: [{ aeropuerto: geo("EZE", "AR"), rol: "origen", esSolicitado: true, distanciaKm: 0, salidasSemanales: 75, posicion: 1 }],
  destinos: [{ aeropuerto: geo("MAD", "ES"), rol: "destino", esSolicitado: true, distanciaKm: 0, salidasSemanales: 324, posicion: 1 }],
  rutas: { conservadas: [], descartadas: [], separadas: [] },
  gaps: [],
  nombres: [],
};
const combinaciones: ResultadoCombinaciones = {
  origen: "EZE",
  destino: "MAD",
  ventanaPedida: { desde: "2027-01-15", hasta: "2027-01-15" },
  calendario: { desde: "2027-01-01", hasta: "2027-01-29" },
  calculadoEn: "2026-09-14T15:00:00.000Z",
  combinaciones: [comb("a", "AR", 64, "2027-01-25", "2027-01-28"), comb("b", "TK", 44, "2027-01-25", "2027-01-28"), comb("c", "AR", 52, "2027-01-15", "2027-01-15"), comb("d", "UX", 40, "2027-01-15", "2027-01-15", "MVD")],
  nombres: [{ iata: "AR", nombre: "Aerolineas Argentinas" }, { iata: "TK", nombre: "Turkish Airlines" }, { iata: "UX", nombre: "Air Europa" }],
  avisos: [],
};

const respuesta = (cuerpo: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) }) as unknown as Response;
const elegir = (etiqueta: string, texto: string, opcion: RegExp) => {
  fireEvent.change(screen.getByRole("combobox", { name: etiqueta }), { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

afterEach(() => vi.unstubAllGlobals());

describe("aNuevasBusquedas", () => {
  it("recorta la ventana de ida a 30 días y sólo lleva vuelta si es posterior a la ida", () => {
    const larga = comb("x", "AR", 50, "2027-02-01", "2027-03-20");
    expect(aNuevasBusquedas(larga, "bodega", null, new Set())).toEqual([expect.objectContaining({ tipo: "ida", equipaje: "bodega", rangoIda: { desde: "2027-02-01", hasta: "2027-03-02" }, rangoVuelta: null })]);
    expect(aNuevasBusquedas(larga, "carry_on", { desde: "2027-03-10", hasta: "2027-03-12" }, new Set())[0]).toMatchObject({ tipo: "ida_y_vuelta", rangoVuelta: { desde: "2027-03-10", hasta: "2027-03-12" } });
    expect(aNuevasBusquedas(larga, "carry_on", { desde: "2027-01-10", hasta: "2027-01-12" }, new Set())[0]?.tipo).toBe("ida"); // vuelta anterior a la ida: se descarta
  });

  it("un boleto separado son dos búsquedas: tramo previo con la aerolínea que tenga adaptador y tramo principal", () => {
    const split: Combinacion = { ...comb("s", "TP", 40, "2027-01-25", "2027-01-28", "ASU"), via: "GRU", tramoPrevio: { hub: "GRU", aerolineas: ["G3", "JJ"] }, requiereBoletosSeparados: true };
    expect(aNuevasBusquedas(split, "carry_on", null, new Set(["JJ"])).map((b) => [b.aerolineaIata, b.origenIata, b.destinoIata])).toEqual([["JJ", "ASU", "GRU"], ["TP", "GRU", "MAD"]]);
    expect(aNuevasBusquedas(split, "carry_on", null, new Set())[0]?.aerolineaIata).toBe("G3");
  });
});

describe("BusquedaGuiada", () => {
  it("arma el espacio, preselecciona las mejores con adaptador y lanza una búsqueda por combinación elegida", async () => {
    const creadas: Busqueda[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/espacio/combinaciones")) return respuesta(combinaciones);
      if (url.startsWith("/api/espacio?")) return respuesta(espacio);
      if (url === "/api/busquedas" && init?.method === "POST") {
        const nueva = JSON.parse(String(init.body)) as Omit<Busqueda, "id" | "creadaEn" | "estado" | "motivoFallo" | "aviso">;
        const b: Busqueda = { ...busquedaIda, ...nueva, id: `${creadas.length + 1}e9c4e4f-3a7b-4e1d-8d6b-2a3f4b5c6d7e`, estado: nueva.aerolineaIata === "TK" ? "manual_pendiente" : "pendiente" };
        creadas.push(b);
        return respuesta(b);
      }
      if (url.includes("/metabuscadores/")) return respuesta({ metabuscador: { id: "kayak", nombre: "Kayak" }, enCurso: false, lecturas: [] });
      throw new Error(`URL inesperada ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", class { onmessage = null; onerror = null; close() {} });
    const onAbrir = vi.fn();
    render(<BusquedaGuiada aeropuertos={aeropuertos} adaptadores={new Set(["AR"])} nombres={new Map([["AR", "Aerolíneas Argentinas"], ["TK", "Turkish Airlines"]])} metabuscadores={[]} hoy="2026-09-14" onAbrirBusqueda={onAbrir} />);

    fireEvent.click(screen.getByRole("button", { name: "Buscar opciones" }));
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Elegí un aeropuerto de origen", "Elegí un aeropuerto de destino", "Elegí la fecha de ida"]);
    expect(fetchMock).not.toHaveBeenCalled();

    elegir("Origen", "eze", /EZE — Ministro/);
    elegir("Destino", "mad", /MAD — Adolfo/);
    // Calendario (mes visible: septiembre 2026): se elige el 15 dos veces (fecha única).
    const dia15 = screen.getByRole("button", { name: "15/09/2026" });
    fireEvent.click(dia15);
    fireEvent.click(dia15);
    fireEvent.click(screen.getByRole("button", { name: "Buscar opciones" }));

    await waitFor(() => expect(screen.getByTestId("resumen-guiado")).toBeTruthy());
    expect(screen.getByText(/4 combinaciones para EZE → MAD/)).toBeTruthy();
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas.map((c) => c.checked)).toEqual([true, false, true, false]); // AR sí, TK y UX no
    expect(screen.getByText("2 de 4 seleccionadas")).toBeTruthy();

    fireEvent.click(casillas[1] as HTMLElement); // sumar TK (carga manual)
    fireEvent.click(screen.getByRole("button", { name: "Verificar 3 en los sitios oficiales" }));
    await waitFor(() => expect(creadas).toHaveLength(3));
    expect(creadas.map((b) => [b.aerolineaIata, b.rangoIda.desde, b.tipo])).toEqual([["AR", "2027-01-25", "ida"], ["TK", "2027-01-25", "ida"], ["AR", "2027-01-15", "ida"]]);
    await waitFor(() => expect(screen.getByText(/Verificando 3 combinaciones/)).toBeTruthy());
    expect(screen.getByRole("region", { name: "Para cargar a mano" }).textContent).toContain("TK — Turkish Airlines");
    fireEvent.click(screen.getByRole("button", { name: "Cargar precio" }));
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ aerolineaIata: "TK", estado: "manual_pendiente" }));
  });
});
