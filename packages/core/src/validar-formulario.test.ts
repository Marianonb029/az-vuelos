import { describe, expect, it } from "vitest";
import { validarFormulario, valoresIniciales } from "./validar-formulario";
import type { ValoresFormulario } from "./validar-formulario";

const HOY = "2026-09-14";
const ADAPTADORES = new Set(["IB", "AR"]);

const completo: ValoresFormulario = {
  compararTodas: false,
  aerolineaIata: "IB",
  origenIata: "ASU",
  destinoIata: "MAD",
  tipo: "ida_y_vuelta",
  equipaje: "carry_on",
  rangoIda: { desde: "2027-01-01", hasta: "2027-01-03" },
  rangoVuelta: { desde: "2027-01-15", hasta: "2027-01-17" },
};

const errores = (v: ValoresFormulario) => {
  const r = validarFormulario(v, HOY, ADAPTADORES);
  return r.ok ? {} : r.errores;
};

describe("validarFormulario", () => {
  it("valores iniciales: ida y vuelta, carry on, todo vacío", () => {
    expect(valoresIniciales.tipo).toBe("ida_y_vuelta");
    expect(valoresIniciales.equipaje).toBe("carry_on");
    const e = errores(valoresIniciales);
    expect(e).toEqual({
      aerolineaIata: "Elegí una aerolínea",
      origenIata: "Elegí un aeropuerto de origen",
      destinoIata: "Elegí un aeropuerto de destino",
      rangoIda: "Elegí la fecha de ida",
      rangoVuelta: "Elegí la fecha de vuelta",
    });
  });

  it("acepta un formulario completo y devuelve la búsqueda", () => {
    const r = validarFormulario(completo, HOY, ADAPTADORES);
    expect(r.ok).toBe(true);
    if (r.ok && r.envio.tipo === "busqueda") expect(r.envio.busqueda.rangoVuelta).toEqual(completo.rangoVuelta);
  });

  it("ida sola ignora el rango de vuelta", () => {
    const r = validarFormulario({ ...completo, tipo: "ida" }, HOY, ADAPTADORES);
    expect(r.ok).toBe(true);
    if (r.ok && r.envio.tipo === "busqueda") expect(r.envio.busqueda.rangoVuelta).toBeNull();
  });

  it("comparar todas: ignora la aerolínea y devuelve los parámetros de ruta", () => {
    const r = validarFormulario({ ...completo, compararTodas: true, aerolineaIata: null }, HOY, ADAPTADORES);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envio.tipo).toBe("comparacion");
      if (r.envio.tipo === "comparacion") expect(r.envio.parametros.origenIata).toBe("ASU");
    }
    expect(errores({ ...completo, compararTodas: true, aerolineaIata: null })).toEqual({});
    const sinAdaptadores = validarFormulario({ ...completo, compararTodas: true }, HOY, new Set());
    expect(sinAdaptadores.ok).toBe(false);
  });

  it("aerolínea sin adaptador", () => {
    expect(errores({ ...completo, aerolineaIata: "LA" }).aerolineaIata).toBe(
      "Esta aerolínea no tiene adaptador disponible",
    );
  });

  it("destino igual a origen", () => {
    expect(errores({ ...completo, destinoIata: "ASU" }).destinoIata).toBe("El destino debe ser distinto del origen");
  });

  it("fechas pasadas y rangos de más de 30 días", () => {
    expect(errores({ ...completo, rangoIda: { desde: "2026-09-13", hasta: "2026-09-13" } }).rangoIda).toBe(
      "La fecha de ida no puede ser pasada",
    );
    expect(errores({ ...completo, rangoIda: { desde: "2027-01-01", hasta: "2027-01-31" } }).rangoIda).toBe(
      "El rango de ida no puede superar 30 días",
    );
    expect(errores({ ...completo, rangoVuelta: { desde: "2027-02-01", hasta: "2027-03-03" } }).rangoVuelta).toBe(
      "El rango de vuelta no puede superar 30 días",
    );
  });

  it("vuelta anterior a la ida", () => {
    expect(errores({ ...completo, rangoVuelta: { desde: "2026-12-31", hasta: "2027-01-02" } }).rangoVuelta).toBe(
      "La vuelta no puede ser anterior a la ida",
    );
  });

  it("tope de 31 combinaciones", () => {
    const e = errores({
      ...completo,
      rangoIda: { desde: "2027-01-01", hasta: "2027-01-04" },
      rangoVuelta: { desde: "2027-01-10", hasta: "2027-01-17" },
    });
    expect(e.rangoVuelta).toBe("Demasiadas combinaciones de fechas: 32 (máximo 31). Achicá los rangos");
    const ok = validarFormulario(
      { ...completo, rangoIda: { desde: "2027-01-01", hasta: "2027-01-01" }, rangoVuelta: { desde: "2027-01-10", hasta: "2027-02-08" } },
      HOY,
      ADAPTADORES,
    );
    expect(ok.ok).toBe(true);
  });

  it("hoy es una fecha válida de ida", () => {
    expect(errores({ ...completo, rangoIda: { desde: HOY, hasta: HOY } }).rangoIda).toBeUndefined();
  });
});
