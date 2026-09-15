import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Aerolinea } from "@az/core";
import { REGISTRO_METABUSCADORES, abrirNavegador, adaptadorPorIata } from "@az/scraper";
import type { AdaptadorMetabuscador } from "@az/scraper";
import { crearApp } from "./app";
import { config } from "./config";
import { abrirDb } from "./db/conexion";
import { repoBloqueos } from "./repos/bloqueos";
import { repoBusquedas } from "./repos/busquedas";
import { repoCache } from "./repos/cache";
import { repoCotizaciones } from "./repos/cotizaciones";
import { repoRegistros } from "./repos/registros";
import { MAX_NAVEGADORES, crearCola } from "./servicios/cola";
import { crearServicioEspacio } from "./servicios/espacio";
import { crearServicioFeriados } from "./servicios/feriados";
import { leerMetabuscador } from "./servicios/leer-metabuscador";
import { repoLecturasMetabuscador } from "./repos/lecturas-metabuscador";
import { ejecutarBusqueda, pausaAleatoria } from "./servicios/ejecutar-busqueda";
import { crearEventos } from "./servicios/eventos";
import { obtenerTablaFx } from "./servicios/fx";

const db = abrirDb(config.rutaDb, config.directorioMigraciones);
const eventos = crearEventos();
const busquedas = repoBusquedas(db);

const dependencias = {
  busquedas,
  cotizaciones: repoCotizaciones(db),
  registros: repoRegistros(db),
  cache: repoCache(db),
  bloqueos: repoBloqueos(db),
  obtenerTablaFx,
  abrirNavegador,
  adaptadorPorIata,
  directorioEvidencia: config.directorioEvidencia,
  directorioPerfil: config.directorioPerfilNavegador,
  pausa: pausaAleatoria,
  notificar: eventos.notificar,
  asistido: true,
};

const cola = crearCola((busquedaId) => ejecutarBusqueda(dependencias, busquedaId));

const encolar = (busquedaId: string) => {
  const b = busquedas.obtener(busquedaId);
  const dominio = adaptadorPorIata(b?.aerolineaIata ?? "")?.dominios[0] ?? b?.aerolineaIata ?? busquedaId;
  cola.encolar({ busquedaId, dominio });
};

// Los metabuscadores comparten la cola: nunca dos Chrome sobre kayak.com, y cuentan para el máximo de 2.
const dependenciasMetabuscador = {
  busquedas,
  lecturas: repoLecturasMetabuscador(db),
  registros: dependencias.registros,
  abrirNavegador,
  directorioEvidencia: config.directorioEvidencia,
  directorioPerfil: config.directorioPerfilNavegador,
  pausa: pausaAleatoria,
  asistido: true,
  avisar: (busquedaId: string, mensaje: string) => {
    busquedas.avisar(busquedaId, mensaje);
    eventos.notificar(busquedaId);
  },
};
const encolarMetabuscador = (busquedaId: string, m: AdaptadorMetabuscador) =>
  new Promise<void>((resolver) => {
    cola.encolar({ busquedaId, dominio: m.dominios[0] ?? m.ref.id, correr: () => leerMetabuscador(dependenciasMetabuscador, busquedaId, m).finally(resolver) });
  });

// Lo que quedó a medias por un reinicio: las pendientes se vuelven a encolar, las que corrían se cierran.
for (const b of busquedas.enCurso()) {
  if (b.estado === "pendiente") encolar(b.id);
  else busquedas.cambiarEstado(b.id, "fallida", "Interrumpida por un reinicio del servidor");
}

const espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
// Nombres del catálogo para las cotizaciones manuales de aerolíneas sin adaptador.
const aerolineas = new Map(z.array(Aerolinea).parse(JSON.parse(readFileSync(resolve(config.directorioDatos, "airlines.json"), "utf8"))).map((a) => [a.iata, a.nombre]));
const app = crearApp({
  db,
  directorioEvidencia: config.directorioEvidencia,
  eventos,
  ejecutar: encolar,
  espacio,
  feriados: crearServicioFeriados(),
  cargaManual: { obtenerTablaFx, nombreAerolinea: (iata) => aerolineas.get(iata) ?? null, notificar: eventos.notificar },
  metabuscadores: REGISTRO_METABUSCADORES,
  leerMetabuscador: encolarMetabuscador,
  estadoCola: () => ({ ...cola.estado(), maxSimultaneos: MAX_NAVEGADORES }),
});

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
