import { crearApp } from "./app";
import { config } from "./config";
import { crearServicioEspacio } from "./servicios/espacio";
import { crearServicioFeriados } from "./servicios/feriados";
import { crearServicioMercado } from "./servicios/mercado";
import { iniciarRefresco } from "./servicios/refresco";

// Los servicios se recrean cuando el refresco automático trae datasets nuevos.
let espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
let mercado = crearServicioMercado(config.directorioDatos, config.rutaConfigEspacio, () => espacio);
const app = crearApp({ espacio: () => espacio, mercado: () => mercado, feriados: crearServicioFeriados(), rutaTendencias: config.rutaTendencias });

iniciarRefresco({
  fuentesVencidas: () => espacio.fuentes().filter((f) => f.vencida),
  recargar: () => {
    espacio = crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio);
    mercado = crearServicioMercado(config.directorioDatos, config.rutaConfigEspacio, () => espacio);
  },
  raizRepo: config.raizRepo,
  cadaMs: 24 * 60 * 60_000,
  avisar: (m) => console.log(m),
});

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
