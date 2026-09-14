import { abrirNavegador, adaptadorPorIata } from "@az/scraper";
import { crearApp } from "./app";
import { config } from "./config";
import { abrirDb } from "./db/conexion";
import { repoBusquedas } from "./repos/busquedas";
import { repoCotizaciones } from "./repos/cotizaciones";
import { repoRegistros } from "./repos/registros";
import { ejecutarBusqueda } from "./servicios/ejecutar-busqueda";
import { obtenerTablaFx } from "./servicios/fx";

const db = abrirDb(config.rutaDb, config.directorioMigraciones);

const dependencias = {
  busquedas: repoBusquedas(db),
  cotizaciones: repoCotizaciones(db),
  registros: repoRegistros(db),
  obtenerTablaFx,
  abrirNavegador,
  adaptadorPorIata,
  directorioEvidencia: config.directorioEvidencia,
  directorioPerfil: config.directorioPerfilNavegador,
};

// Un solo perfil de Chrome: las búsquedas corren de a una, en orden de llegada.
let cola: Promise<void> = Promise.resolve();
const encolar = (busquedaId: string) => {
  cola = cola.then(() => ejecutarBusqueda(dependencias, busquedaId)).catch((e: unknown) => console.error(e));
};

const app = crearApp({ db, directorioEvidencia: config.directorioEvidencia, ejecutar: encolar });

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
