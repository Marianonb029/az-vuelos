import type { ReactNode } from "react";
import { fechaCorta, fechaHoraCorta, formatearDuracion, formatearLlegada } from "@az/core";
import type { CotizacionVerificada, Tramo } from "@az/core";
import { urlEvidencia } from "../lib/api";
import { BloqueTextoPlano } from "./BloqueTextoPlano";

const Dato = ({ nombre, children }: { nombre: string; children: ReactNode }) => (
  <div className="flex gap-2 text-sm">
    <span className="w-28 shrink-0 text-slate-500">{nombre}</span>
    <span className="break-all text-slate-800">{children}</span>
  </div>
);

const DetalleTramo = ({ tramo }: { tramo: Tramo }) => (
  <div className="rounded-md border border-slate-200 p-3">
    <p className="mb-1 text-sm font-medium text-slate-800">
      {tramo.direccion === "ida" ? "Ida" : "Vuelta"} · {fechaCorta(tramo.fecha)}
    </p>
    <Dato nombre="Horario">
      {tramo.salidaLocal} → {formatearLlegada(tramo)} · {formatearDuracion(tramo.duracionMin)}
    </Dato>
    <Dato nombre="Escalas">
      {tramo.escalas === 0 ? "directo" : `${tramo.escalas} (${tramo.aeropuertosEscala.join(", ")})`}
    </Dato>
    <Dato nombre="Vuelos">{tramo.numerosVuelo.join(", ")}</Dato>
  </div>
);

export const DetalleCotizacion = ({ cotizacion }: { cotizacion: CotizacionVerificada }) => {
  const { precio, equipaje, evidencia } = cotizacion;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        {cotizacion.tramos.map((t) => (
          <DetalleTramo key={t.direccion} tramo={t} />
        ))}
        <div className="rounded-md border border-slate-200 p-3">
          <p className="mb-1 text-sm font-medium text-slate-800">Precio</p>
          <Dato nombre="Original">
            {precio.monedaOriginal} {precio.montoOriginal}
          </Dato>
          {precio.fx === null ? (
            <Dato nombre="Conversión">sin conversión (publicado en USD)</Dato>
          ) : (
            <>
              <Dato nombre="Par">{precio.fx.par}</Dato>
              <Dato nombre="Tasa">{precio.fx.tasa}</Dato>
              <Dato nombre="Fuente">{precio.fx.fuente}</Dato>
              <Dato nombre="Capturada">{fechaHoraCorta(precio.fx.capturadaEn)}</Dato>
            </>
          )}
          <Dato nombre="Equipaje">{equipaje.textoOriginal || "(sin texto en el sitio)"}</Dato>
        </div>
        <BloqueTextoPlano cotizacion={cotizacion} />
      </div>
      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-1 text-sm font-medium text-slate-800">Evidencia</p>
        <Dato nombre="URL">
          <a href={evidencia.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
            {evidencia.url}
          </a>
        </Dato>
        <Dato nombre="Capturado">{fechaHoraCorta(evidencia.capturadoEn)}</Dato>
        <Dato nombre="Selector">
          <code className="text-xs">{evidencia.selector}</code>
        </Dato>
        <Dato nombre="Texto leído">
          <code className="text-xs">{evidencia.textoCrudo}</code>
        </Dato>
        <a href={urlEvidencia(evidencia.screenshotPath)} target="_blank" rel="noreferrer" className="mt-2 block">
          <img
            src={urlEvidencia(evidencia.screenshotPath)}
            alt={`Captura de ${evidencia.url}`}
            className="max-h-96 w-full rounded border border-slate-200 object-contain object-top"
          />
        </a>
      </div>
    </div>
  );
};
