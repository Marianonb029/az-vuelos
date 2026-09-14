import { combinaciones, diasDelRango } from "./fechas";
import { NuevaBusqueda } from "./schema";
import type { EquipajeSolicitado, RangoFechas, TipoViaje } from "./schema";

export const MAX_DIAS_RANGO = 30;
export const MAX_COMBINACIONES = 31;

export interface ValoresFormulario {
  aerolineaIata: string | null;
  origenIata: string | null;
  destinoIata: string | null;
  tipo: TipoViaje;
  equipaje: EquipajeSolicitado;
  rangoIda: RangoFechas | null;
  rangoVuelta: RangoFechas | null;
}

export type CampoFormulario = keyof ValoresFormulario;
export type ErroresFormulario = Partial<Record<CampoFormulario, string>>;

export type ResultadoValidacion =
  | { ok: true; busqueda: NuevaBusqueda }
  | { ok: false; errores: ErroresFormulario };

export const valoresIniciales: ValoresFormulario = {
  aerolineaIata: null,
  origenIata: null,
  destinoIata: null,
  tipo: "ida_y_vuelta",
  equipaje: "carry_on",
  rangoIda: null,
  rangoVuelta: null,
};

export const validarFormulario = (
  v: ValoresFormulario,
  hoy: string,
  aerolineasConAdaptador: ReadonlySet<string>,
): ResultadoValidacion => {
  const errores: ErroresFormulario = {};

  if (v.aerolineaIata === null) errores.aerolineaIata = "Elegí una aerolínea";
  else if (!aerolineasConAdaptador.has(v.aerolineaIata)) {
    errores.aerolineaIata = "Esta aerolínea no tiene adaptador disponible";
  }

  if (v.origenIata === null) errores.origenIata = "Elegí un aeropuerto de origen";

  if (v.destinoIata === null) errores.destinoIata = "Elegí un aeropuerto de destino";
  else if (v.destinoIata === v.origenIata) errores.destinoIata = "El destino debe ser distinto del origen";

  if (v.rangoIda === null) errores.rangoIda = "Elegí la fecha de ida";
  else if (v.rangoIda.desde < hoy) errores.rangoIda = "La fecha de ida no puede ser pasada";
  else if (diasDelRango(v.rangoIda) > MAX_DIAS_RANGO) {
    errores.rangoIda = `El rango de ida no puede superar ${MAX_DIAS_RANGO} días`;
  }

  if (v.tipo === "ida_y_vuelta") {
    if (v.rangoVuelta === null) errores.rangoVuelta = "Elegí la fecha de vuelta";
    else if (v.rangoIda !== null && v.rangoVuelta.desde < v.rangoIda.desde) {
      errores.rangoVuelta = "La vuelta no puede ser anterior a la ida";
    } else if (diasDelRango(v.rangoVuelta) > MAX_DIAS_RANGO) {
      errores.rangoVuelta = `El rango de vuelta no puede superar ${MAX_DIAS_RANGO} días`;
    } else if (v.rangoIda !== null) {
      const total = combinaciones({ tipo: v.tipo, rangoIda: v.rangoIda, rangoVuelta: v.rangoVuelta }).length;
      if (total === 0) errores.rangoVuelta = "Ninguna fecha de vuelta es posterior a su fecha de ida";
      else if (total > MAX_COMBINACIONES) {
        errores.rangoVuelta = `Demasiadas combinaciones de fechas: ${total} (máximo ${MAX_COMBINACIONES}). Achicá los rangos`;
      }
    }
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };

  const parseo = NuevaBusqueda.safeParse({
    tipo: v.tipo,
    aerolineaIata: v.aerolineaIata,
    origenIata: v.origenIata,
    destinoIata: v.destinoIata,
    equipaje: v.equipaje,
    rangoIda: v.rangoIda,
    rangoVuelta: v.tipo === "ida" ? null : v.rangoVuelta,
  });
  if (!parseo.success) {
    const primera = parseo.error.issues[0];
    const campo = (primera?.path[0] ?? "rangoIda") as CampoFormulario;
    return { ok: false, errores: { [campo]: primera?.message ?? "Datos inválidos" } };
  }
  return { ok: true, busqueda: parseo.data };
};
