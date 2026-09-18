import { crearApp } from "./app";
import { config } from "./config";
import { crearServicioEspacio } from "./servicios/espacio";
import { crearServicioFeriados } from "./servicios/feriados";
import { crearServicioActualizacion } from "./servicios/actualizacion";
import { crearClienteDataApi } from "./servicios/bajada";
import { crearServicioMercado } from "./servicios/mercado";
import { iniciarRefresco } from "./servicios/refresco";

// Los servicios se recrean cuando el refresco automático trae datasets nuevos.
// Token y marker de Travelpayouts del entorno (nunca en el repo): el token habilita "Actualizar este par" y la
// sonda; el marker (público) va en los enlaces a la búsqueda en vivo de Aviasales.
const token = process.env["TRAVELPAYOUTS_TOKEN"] ?? null;
const enVivo = { marker: process.env["TRAVELPAYOUTS_MARKER"] ?? null, actualizacionDisponible: token !== null };
let espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
let mercado = crearServicioMercado(config.directorioDatos, config.rutaConfigEspacio, () => espacio, undefined, undefined, enVivo);
const actualizacion = crearServicioActualizacion({ directorioDatos: config.directorioDatos, rutaConfig: config.rutaConfigEspacio, espacio: () => espacio, cliente: token ? crearClienteDataApi(token) : null });
const app = crearApp({ espacio: () => espacio, mercado: () => mercado, actualizacion: () => actualizacion, feriados: crearServicioFeriados(), rutaTendencias: config.rutaTendencias });

iniciarRefresco({
  fuentesVencidas: () => espacio.fuentes().filter((f) => f.vencida),
  recargar: () => {
    espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
    mercado = crearServicioMercado(config.directorioDatos, config.rutaConfigEspacio, () => espacio, undefined, undefined, enVivo);
  },
  raizRepo: config.raizRepo,
  cadaMs: 24 * 60 * 60_000,
  avisar: (m) => console.log(m),
});

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
