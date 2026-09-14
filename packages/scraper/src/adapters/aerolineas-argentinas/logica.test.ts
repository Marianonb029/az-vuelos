import { describe, expect, it } from "vitest";
import { armarTramo, construirUrl, elegirOferta, equipajeDeFamilia, interpretarCelda } from "./logica";
import type { CondicionesFamilia, FilaOferta, SnapshotResultados } from "./dom";
import type { ParamsBusqueda } from "../../adaptador";

const params: ParamsBusqueda = {
  tipo: "ida",
  origenIata: "AEP",
  destinoIata: "COR",
  fechaIda: "2026-11-20",
  fechaVuelta: null,
  equipaje: "carry_on",
  rutaScreenshot: "x.png",
};

const check = { texto: "", icono: "check" as const };
const cruz = { texto: "", icono: "cruz" as const };
const t = (texto: string) => ({ texto, icono: null });

const fila = (origen: string, tarifas: (string | null)[], extra: Partial<FilaOferta> = {}): FilaOferta => ({
  salidaDia: "Viernes",
  salidaHora: "19:40",
  origen,
  llegadaDia: "Viernes",
  llegadaHora: "21:10",
  destino: "COR",
  duracion: "1h 30m",
  escalas: "Sin escalas",
  tarifas,
  monedas: tarifas.map((x) => (x === null ? null : "ARS")),
  ...extra,
});

// Réplica de la matriz doméstica real: Base sin carry on, Plus con carry on, Flex con bodega.
const snapshot: SnapshotResultados = {
  familias: ["Base", "Plus", "Flex", "Promo Premium Economy", "Premium Economy"],
  condiciones: [
    { itemPersonal: check, mano: t("Cargo extra"), bodega: t("Cargo extra") },
    { itemPersonal: check, mano: t("Carry on de 8kg"), bodega: t("Cargo extra") },
    { itemPersonal: check, mano: t("Carry on de 8kg"), bodega: t("1 pieza de 15 kg") },
    { itemPersonal: check, mano: t("Carry on de 8kg"), bodega: t("1 pieza de 15 kg") },
    { itemPersonal: check, mano: t("Carry on de 8kg"), bodega: t("1 pieza de 15 kg") },
  ],
  filas: [
    fila("AEP", ["135.484", "162.296", "206.023", "253.584", "291.350"]),
    fila("AEP", ["185.978", "213.453", "257.655", "305.732", "344.222"]),
    fila("EZE", ["100.000", "110.000", "120.000", "130.000", "140.000"]),
    fila("AEP", ["270.005", "298.384", "344.131", null, "433.366"]),
  ],
  mensaje: null,
};

describe("construirUrl", () => {
  it("arma el deep link de ida", () => {
    expect(construirUrl(params)).toBe(
      "https://www.aerolineas.com.ar/flights-offers?adt=1&inf=0&chd=0&flexDates=false&cabinClass=Economy&flightType=ONE_WAY&leg=AEP-COR-20261120",
    );
  });
});

describe("interpretarCelda / equipajeDeFamilia", () => {
  it("lee textos e íconos del sitio", () => {
    expect(interpretarCelda(t("Cargo extra"))).toEqual({ incluido: false, piezas: 0 });
    expect(interpretarCelda(t("Con cargo"))).toEqual({ incluido: false, piezas: 0 });
    expect(interpretarCelda(t("Carry on de 8kg"))).toEqual({ incluido: true, piezas: 1 });
    expect(interpretarCelda(t("2 piezas de 23 kg c/u"))).toEqual({ incluido: true, piezas: 2 });
    expect(interpretarCelda(check)).toEqual({ incluido: true, piezas: 1 });
    expect(interpretarCelda(cruz)).toEqual({ incluido: false, piezas: 0 });
  });

  it("arma el objeto equipaje con el texto original", () => {
    expect(equipajeDeFamilia(snapshot.condiciones[2] as CondicionesFamilia)).toEqual({
      itemPersonal: true,
      carryOn: true,
      piezasBodega: 1,
      textoOriginal: "Artículo personal: incluido · Equipaje de mano: Carry on de 8kg · Equipaje en bodega: 1 pieza de 15 kg",
    });
  });
});

describe("elegirOferta", () => {
  it("carry on: la más barata entre familias económicas con carry on, sólo filas del aeropuerto pedido", () => {
    const r = elegirOferta(snapshot, params);
    expect(r).toEqual({
      ok: true,
      eleccion: { fila: 0, familia: 1, monto: 162296, moneda: "ARS", textoCrudo: "162.296 ARS" },
    });
  });

  it("bodega: salta a la primera familia que la incluye y excluye Premium", () => {
    const r = elegirOferta(snapshot, { ...params, equipaje: "bodega" });
    expect(r).toEqual({
      ok: true,
      eleccion: { fila: 0, familia: 2, monto: 206023, moneda: "ARS", textoCrudo: "206.023 ARS" },
    });
  });

  it("ignora celdas sin disponibilidad", () => {
    const solo = { ...snapshot, filas: [fila("AEP", [null, null, null, "1", "2"])] };
    const r = elegirOferta(solo, params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.estado).toBe("sin_disponibilidad");
  });

  it("aeropuerto distinto del pedido: sin disponibilidad e informa lo que el sitio ofrece", () => {
    const r = elegirOferta(snapshot, { ...params, origenIata: "ASU" });
    expect(r).toEqual({ ok: false, estado: "sin_disponibilidad", motivo: "Sin vuelos ASU-COR; el sitio ofrece AEP-COR, EZE-COR" });
  });

  it("familias y condiciones desparejas: error de lectura", () => {
    const r = elegirOferta({ ...snapshot, condiciones: snapshot.condiciones.slice(0, 2) }, params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.estado).toBe("error_lectura");
  });
});

describe("armarTramo", () => {
  const directo = { salidaDia: "Sale Viernes", salidaHora: "19:40", origen: "AEP", llegadaDia: "Llega Viernes", llegadaHora: "21:10", destino: "COR", vuelo: "AR1526 / Boeing 737" };

  it("vuelo directo", () => {
    const r = armarTramo(snapshot.filas[0] as FilaOferta, [directo], "2026-11-20");
    expect(r).toEqual({
      ok: true,
      tramo: {
        direccion: "ida",
        fecha: "2026-11-20",
        salidaLocal: "19:40",
        llegadaLocal: "21:10",
        desfaseDias: 0,
        duracionMin: 90,
        escalas: 0,
        aeropuertosEscala: [],
        numerosVuelo: ["AR1526"],
      },
    });
  });

  it("con escala y llegada al día siguiente", () => {
    const f = fila("ASU", ["1"], { llegadaDia: "Sábado", llegadaHora: "16:10", destino: "MAD", duracion: "26h 25m", escalas: "1 escala" });
    const segs = [
      { ...directo, origen: "ASU", destino: "AEP", vuelo: "AR1341 / Embraer 190" },
      { ...directo, origen: "EZE", destino: "MAD", llegadaDia: "Llega Sábado", vuelo: "AR1132 / Airbus A330" },
    ];
    const r = armarTramo(f, segs, "2026-11-20");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tramo.desfaseDias).toBe(1);
      expect(r.tramo.duracionMin).toBe(1585);
      expect(r.tramo.aeropuertosEscala).toEqual(["AEP"]);
      expect(r.tramo.numerosVuelo).toEqual(["AR1341", "AR1132"]);
    }
  });

  it("incoherencia entre escalas e itinerario: error", () => {
    const r = armarTramo(snapshot.filas[0] as FilaOferta, [directo, directo], "2026-11-20");
    expect(r.ok).toBe(false);
  });
});
