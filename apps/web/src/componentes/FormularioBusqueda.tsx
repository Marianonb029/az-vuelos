import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import {
  MAX_DIAS_RANGO,
  buscarAerolineas,
  buscarAeropuertos,
  etiquetaAerolinea,
  etiquetaAeropuerto,
  validarFormulario,
  valoresIniciales,
} from "@az/core";
import type { Aerolinea, Aeropuerto, EnvioFormulario, ErroresFormulario, ValoresFormulario } from "@az/core";
import { CalendarioRango } from "./CalendarioRango";
import { Campo } from "./Campo";
import { Combobox } from "./Combobox";
import type { Opcion } from "./Combobox";
import { Toggle } from "./Toggle";

interface Props {
  aerolineas: readonly Aerolinea[];
  aeropuertos: readonly Aeropuerto[];
  adaptadores: ReadonlySet<string>;
  asistidas?: ReadonlySet<string>; // lectura asistida genérica
  hoy: string;
  enviando: boolean;
  onEnviar: (envio: EnvioFormulario) => void;
  iniciales?: Partial<ValoresFormulario> | undefined; // prellenado desde el espacio de búsqueda
}

export const FormularioBusqueda = ({ aerolineas, aeropuertos, adaptadores, asistidas = new Set(), hoy, enviando, onEnviar, iniciales }: Props) => {
  const [valores, setValores] = useState<ValoresFormulario>({ ...valoresIniciales, ...iniciales });
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [intentado, setIntentado] = useState(false);

  const actualizar = (cambio: Partial<ValoresFormulario>) => {
    const nuevos = { ...valores, ...cambio };
    setValores(nuevos);
    if (intentado) {
      const r = validarFormulario(nuevos, hoy, adaptadores);
      setErrores(r.ok ? {} : r.errores);
    }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    const r = validarFormulario(valores, hoy, adaptadores);
    if (r.ok) {
      setErrores({});
      onEnviar(r.envio);
    } else {
      setErrores(r.errores);
    }
  };

  const opcionesAerolinea = useCallback(
    (texto: string): Opcion<Aerolinea>[] =>
      buscarAerolineas(aerolineas, texto).map((a) => {
        const disponible = adaptadores.has(a.iata);
        return {
          clave: a.iata,
          valor: a,
          etiqueta: etiquetaAerolinea(a),
          // Sin adaptador se puede elegir igual: el precio se carga a mano desde el sitio oficial.
          ...(disponible
            ? { marca: "adaptador" }
            : asistidas.has(a.iata)
              ? { marca: "asistido", tooltip: "lectura asistida: vos navegás en el sitio oficial, la app captura y cargás el precio" }
              : { marca: "carga manual", tooltip: "sin adaptador: el precio se carga a mano" }),
        };
      }),
    [aerolineas, adaptadores, asistidas],
  );

  const opcionesAeropuerto = useCallback(
    (texto: string): Opcion<Aeropuerto>[] =>
      buscarAeropuertos(aeropuertos, texto).map((a) => ({ clave: a.iata, valor: a, etiqueta: etiquetaAeropuerto(a) })),
    [aeropuertos],
  );

  const aerolinea = aerolineas.find((a) => a.iata === valores.aerolineaIata) ?? null;
  const origen = aeropuertos.find((a) => a.iata === valores.origenIata) ?? null;
  const destino = aeropuertos.find((a) => a.iata === valores.destinoIata) ?? null;
  const idaYVuelta = valores.tipo === "ida_y_vuelta";

  return (
    <form onSubmit={enviar} noValidate className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Campo id="aerolinea" etiqueta="Aerolínea" error={errores.aerolineaIata}>
          {valores.compararTodas ? (
            <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
              Todas las aerolíneas con adaptador ({[...adaptadores].sort().join(", ") || "ninguna"})
            </p>
          ) : (
            <Combobox
              id="aerolinea"
              placeholder="Código o nombre"
              valor={aerolinea}
              etiquetaValor={etiquetaAerolinea}
              buscar={opcionesAerolinea}
              onCambio={(a) => actualizar({ aerolineaIata: a?.iata ?? null })}
              invalido={errores.aerolineaIata !== undefined}
            />
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={valores.compararTodas}
              onChange={(e) => actualizar({ compararTodas: e.target.checked })}
            />
            Comparar todas las aerolíneas con adaptador
          </label>
        </Campo>
        <Campo id="origen" etiqueta="Origen" error={errores.origenIata}>
          <Combobox
            id="origen"
            placeholder="Código, aeropuerto o ciudad"
            valor={origen}
            etiquetaValor={etiquetaAeropuerto}
            buscar={opcionesAeropuerto}
            onCambio={(a) => actualizar({ origenIata: a?.iata ?? null })}
            invalido={errores.origenIata !== undefined}
          />
        </Campo>
        <Campo id="destino" etiqueta="Destino" error={errores.destinoIata}>
          <Combobox
            id="destino"
            placeholder="Código, aeropuerto o ciudad"
            valor={destino}
            etiquetaValor={etiquetaAeropuerto}
            buscar={opcionesAeropuerto}
            onCambio={(a) => actualizar({ destinoIata: a?.iata ?? null })}
            invalido={errores.destinoIata !== undefined}
          />
        </Campo>
      </div>

      <div className="flex flex-wrap gap-6">
        <Campo id="tipo" etiqueta="Tipo de viaje">
          <Toggle
            id="tipo"
            valor={valores.tipo}
            opciones={[
              { valor: "ida_y_vuelta", etiqueta: "Ida y vuelta" },
              { valor: "ida", etiqueta: "Ida" },
            ]}
            onCambio={(tipo) => actualizar({ tipo })}
          />
        </Campo>
        <Campo id="equipaje" etiqueta="Equipaje">
          <Toggle
            id="equipaje"
            valor={valores.equipaje}
            opciones={[
              { valor: "carry_on", etiqueta: "Carry on" },
              { valor: "bodega", etiqueta: "Bodega" },
            ]}
            onCambio={(equipaje) => actualizar({ equipaje })}
          />
        </Campo>
      </div>

      <div className="flex flex-wrap gap-6">
        <Campo id="fecha-ida" etiqueta={`Fecha de ida (fecha única o rango de hasta ${MAX_DIAS_RANGO} días)`} error={errores.rangoIda}>
          <CalendarioRango
            id="fecha-ida"
            valor={valores.rangoIda}
            onCambio={(rangoIda) => actualizar({ rangoIda })}
            minimo={hoy}
            maxDias={MAX_DIAS_RANGO}
          />
        </Campo>
        {idaYVuelta && (
          <Campo id="fecha-vuelta" etiqueta="Fecha de vuelta" error={errores.rangoVuelta}>
            <CalendarioRango
              id="fecha-vuelta"
              valor={valores.rangoVuelta}
              onCambio={(rangoVuelta) => actualizar({ rangoVuelta })}
              minimo={valores.rangoIda?.desde ?? hoy}
              maxDias={MAX_DIAS_RANGO}
            />
          </Campo>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {enviando ? "Iniciando búsqueda…" : "Buscar"}
        </button>
      </div>
    </form>
  );
};
