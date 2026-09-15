import { crearApp } from "./app";
import { config } from "./config";
import { crearServicioEspacio } from "./servicios/espacio";
import { crearServicioFeriados } from "./servicios/feriados";

const app = crearApp({ espacio: crearServicioEspacio(config.directorioDatos, config.rutaConfigEspacio), feriados: crearServicioFeriados() });

app.listen({ port: config.puerto, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
