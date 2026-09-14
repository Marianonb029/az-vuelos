import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Aerolinea } from "@az/core";
import { abrirNavegador, adaptadorPorIata } from "@az/scraper";
import { crearApp } from "./app";
import { config } from "./config";
import { abrirDb } from "./db/conexion";
import { repoBloqueos } from "./repos/bloqueos";
import { repoBusquedas } from "./repos/busquedas";
import { repoCache } from "./repos/cache";
import { repoCotizaciones } from "./repos/cotizaciones";
import { repoRegistros } from "./repos/registros";
import { crearCola } from "./servicios/cola";
import { crearServicioEspacio } from "./servicios/espacio";
import { crearServicioFeriados } from "./servicios/feriados";
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
});

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
