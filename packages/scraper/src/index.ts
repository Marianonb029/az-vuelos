export type { AdaptadorAerolinea, ParamsBusqueda, ResultadoAdaptador } from "./adaptador";
export { REGISTRO, adaptadorPorIata } from "./adapters";
export { abrirNavegador } from "./navegador";
export type { BrowserContext as ContextoNavegador, Page as Pagina } from "playwright";
export { consultarRobots, evaluarRobots } from "./robots";
export type { VeredictoRobots } from "./robots";
export { conReintentos, ErrorBloqueo, ErrorLectura, ErrorTimeout } from "./intento";
export type { RegistroIntento } from "./intento";
export { evidenciaParcial } from "./evidencia";
