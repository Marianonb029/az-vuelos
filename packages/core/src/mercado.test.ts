import { describe, expect, it } from "vitest";
import { armarCombinaciones, cadenciaPara, ordenarCombinaciones } from "./mercado";
import type { OpcionesMercado } from "./mercado";
import type { PrecioCacheado } from "./precios";

const HORA = 3600;
// Tarifa con salida y llegada en "hora local como epoch" (así viene en el enlace), en horas desde un origen común.
const t = (origen: string, destino: string, aerolinea: string, fechaIda: string, precioUsd: number, saleH: number, duraH: number, extra: Partial<PrecioCacheado> = {}): PrecioCacheado => ({
  origen,
  destino,
  aerolinea,
  numeroVuelo: `${aerolinea}1`,
  fechaIda,
  transbordos: 0,
  duracionMin: duraH * 60,
  itinerario: [origen, destino],
  salidaEpoch: saleH * HORA,
  llegadaEpoch: (saleH + duraH) * HORA,
  equipajeMano: true,
  equipajeBodega: false,
  agencia: "x",
  precioUsd,
  enlace: "/search/x",
  vistoEn: "2026-09-10",
  encontradoEn: "2026-09-16T10:00:00.000Z",
  ...extra,
});

const opciones: OpcionesMercado = { conexionMinMin: 180, conexionMaxMin: 24 * 60, tasaDesvioDiariaPct: 1, cadencia: [{ hastaDiasAlViaje: 14, cadaDias: 1 }, { hastaDiasAlViaje: 60, cadaDias: 3 }, { hastaDiasAlViaje: null, cadaDias: 7 }], maxPorOrigen: 100 };
const entrada = { origenes: [{ iata: "ASU", trasladoKm: 0 }, { iata: "IGU", trasladoKm: 300 }], destinos: [{ iata: "MAD", trasladoKm: 0 }, { iata: "LIS", trasladoKm: 513 }], desde: "2027-01-18", hasta: "2027-01-20", hoy: "2026-09-17" };

describe("mercado: combinaciones con lo cacheado", () => {
  it("arma un boleto directo y dos encadenados por el aeropuerto donde termina el primero, con la espera configurada", () => {
    const precios = [
      t("ASU", "MAD", "UA", "2027-01-19", 779, 10, 61, { transbordos: 4, itinerario: ["ASU", "AEP", "SCL", "IAH", "EWR", "MAD"] }),
      t("ASU", "GRU", "G3", "2027-01-19", 150, 8, 2), // llega a las 10
      t("GRU", "MAD", "TP", "2027-01-19", 480, 14, 12, { transbordos: 1, itinerario: ["GRU", "LIS", "MAD"] }), // sale a las 14: espera 4 h
      t("GRU", "MAD", "IB", "2027-01-19", 400, 11, 11), // sale a las 11: espera 1 h, menos que las 3 h mínimas
      t("GRU", "MAD", "AF", "2027-01-21", 300, 60, 11), // 50 h después: fuera del máximo
      t("GRU", "ASU", "G3", "2027-01-19", 150, 14, 2), // vuelve al origen: no se encadena
      t("ASU", "GRU", "G3", "2027-01-25", 100, 8, 2), // fuera de la ventana de salida
      t("MAD", "LIS", "TP", "2027-01-19", 60, 14, 1), // sale del destino: no es candidato de salida
    ];
    const lista = armarCombinaciones({ ...entrada, precios }, opciones);
    const claves = lista.map((c) => `${c.boletos.map((b) => `${b.aerolinea}:${b.itinerario.join("-")}`).join("+")} USD ${c.totalUsd} ${c.duracionTotalMin} min ${c.escalas} escalas`);
    expect(claves).toEqual(["UA:ASU-AEP-SCL-IAH-EWR-MAD USD 779 3660 min 4 escalas", "G3:ASU-GRU+TP:GRU-LIS-MAD USD 630 1080 min 2 escalas"]);
    const doble = lista[1];
    expect(doble?.boletos[1]?.esperaMin).toBe(240);
    expect(doble?.cambiosBoleto).toBe(1);
    expect(doble?.aerolineas).toEqual(["G3", "TP"]);
    expect(doble?.llegaA).toBe("MAD");
  });

  it("marca antigüedad, desvío estimado y si toca refrescar según lo que falta para el viaje", () => {
    const precios = [t("ASU", "MAD", "UA", "2027-01-19", 779, 10, 61, { vistoEn: "2026-09-12" }), t("ASU", "MAD", "IB", "2027-01-19", 900, 10, 12, { vistoEn: "2026-09-17" })];
    const [vieja, fresca] = armarCombinaciones({ ...entrada, precios }, opciones);
    expect(vieja).toMatchObject({ vistoHaceDias: 5, desvioEstimadoPct: 5, cadenciaDias: 7, refrescar: false });
    expect(fresca).toMatchObject({ vistoHaceDias: 0, desvioEstimadoPct: 0 });
    // A 10 días del viaje la cadencia es diaria: 5 días es viejo.
    const cerca = armarCombinaciones({ ...entrada, precios, hoy: "2027-01-09", desde: "2027-01-19", hasta: "2027-01-19" }, opciones)[0];
    expect(cerca).toMatchObject({ cadenciaDias: 1, refrescar: true });
    expect(cadenciaPara(30, opciones.cadencia)).toBe(3);
  });

  it("ordena del 1 al 6: origen (pedido primero), precio, sin bodega antes, horas, escalas, aerolíneas; y recorta por origen", () => {
    const base = { origen: "ASU", llegaA: "MAD", trasladoOrigenKm: 0, trasladoDestinoKm: 0, boletos: [], fechaIda: "2027-01-19", cambiosBoleto: 0, equipajeMano: true, vistoHaceDias: 0, desvioEstimadoPct: 0, refrescar: false, cadenciaDias: 7 };
    const c = (extra: Partial<typeof base & { totalUsd: number; duracionTotalMin: number; escalas: number; aerolineas: string[]; equipajeBodega: boolean | null }>) => ({ ...base, totalUsd: 500, duracionTotalMin: 600, escalas: 1, aerolineas: ["TP"], equipajeBodega: false, ...extra });
    const lista = [
      c({ origen: "IGU", trasladoOrigenKm: 300, totalUsd: 100 }), // otro origen: va después aunque sea la más barata
      c({ totalUsd: 500, aerolineas: ["TP", "G3"] }),
      c({ totalUsd: 500, escalas: 2 }),
      c({ totalUsd: 500, duracionTotalMin: 900 }),
      c({ totalUsd: 500, equipajeBodega: true }),
      c({ totalUsd: 450 }),
      c({ totalUsd: 500 }),
    ];
    const orden = ordenarCombinaciones(lista, opciones).map((x) => `${x.origen} ${x.totalUsd} ${x.equipajeBodega ? "bodega" : "sin"} ${x.duracionTotalMin} ${x.escalas} ${x.aerolineas.length}`);
    expect(orden).toEqual(["ASU 450 sin 600 1 1", "ASU 500 sin 600 1 1", "ASU 500 sin 600 1 2", "ASU 500 sin 600 2 1", "ASU 500 sin 900 1 1", "ASU 500 bodega 600 1 1", "IGU 100 sin 600 1 1"]);
    expect(ordenarCombinaciones(lista, { ...opciones, maxPorOrigen: 2 })).toHaveLength(3);
  });
});
