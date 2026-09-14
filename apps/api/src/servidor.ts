import { crearApp } from "./app";

const PUERTO = 3001;

const app = crearApp();

app.listen({ port: PUERTO, host: "127.0.0.1" }).then((direccion) => {
  console.log(`AZ Vuelos API escuchando en ${direccion}`);
});
