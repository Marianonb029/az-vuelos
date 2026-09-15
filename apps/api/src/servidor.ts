import { crearApp } from "./app";
import { config } from "./config";
import { crearServicioEspacio } from "./servicios/espacio";
import { crearServicioFeriados } from "./servicios/feriados";
import { iniciarRefresco } from "./servicios/refresco";

// El servicio del espacio se recrea cuando el refresco automático trae datasets nuevos.
let espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
const app = crearApp({ espacio: () => espacio, feriados: crearServicioFeriados(), rutaObservaciones: config.rutaObservaciones, rutaHistorial: config.rutaHistorial });

iniciarRefresco({
  fuentesVencidas: () => espacio.fuentes().filter((f) => f.vencida),
  recargar: () => {
    espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
  },
  raizRepo: config.raizRepo,
  cadaMs: 24 * 60 * 60_000,
  avisar: (m) => console.log(m),
});

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
