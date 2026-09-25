export type Pestana = "explorar" | "rutas" | "resumen" | "combinaciones" | "datos";

export interface FichaPestana {
  id: Pestana;
  titulo: string;
  pregunta: string; // la pregunta que contesta, en las palabras de quien busca un vuelo
  para: string; // qué hace
  objetivo: string; // para qué sirve: qué decisión ayuda a tomar
  noHace: string; // qué NO hace, para no esperar de ella lo que no da
}

// El orden es el del recorrido: primero se explora sin fecha, después se mira un día concreto, después el resumen
// de esa búsqueda, y al final las dos referencias (rutas sin precio y la ficha de cada dato). Datos lo muestra tal
// cual. Fase 27: acá y en toda la pantalla se habla en palabras de todos los días, no en la jerga interna.
export const PESTANAS: FichaPestana[] = [
  {
    id: "explorar",
    titulo: "Explorar precios",
    pregunta: "¿Cuándo y a dónde me conviene ir?",
    para: "Sin fecha: el precio más bajo de cada día del año, el mejor mes, a qué ciudad se llega más barato, desde qué aeropuerto conviene salir, cuánto sale el viaje entero si volvés, y si conviene comprar ahora o esperar. Arriba, las rutas que estás siguiendo y cuánto cambiaron.",
    objetivo: "Elegir cuándo viajar y a qué ciudad, cuando la fecha es flexible o el destino da igual. Es el único lugar donde se ve el año entero de una vez.",
    noHace: "No muestra vuelos concretos ni horarios: para eso está Rutas, a un clic de cualquier día.",
  },
  {
    id: "rutas",
    titulo: "Rutas",
    pregunta: "¿Qué hay para este día?",
    para: "Las opciones de viaje concretas para el día elegido, en uno o dos pasajes, ordenadas por aeropuerto de salida, precio, equipaje, horas, escalas y aerolíneas, con el enlace para comprar y hace cuánto se vio cada precio.",
    objetivo: "Elegir el vuelo: comparar precio, horas, escalas y equipaje entre lo que hay para ese día, y abrir la búsqueda en Aviasales para comprarlo.",
    noHace: "No cotiza en vivo: cada precio es el que otro viajero vio, con su fecha. El enlace sí abre la búsqueda en vivo.",
  },
  {
    id: "resumen",
    titulo: "Resumen de ruta",
    pregunta: "¿Qué me conviene de lo que encontré?",
    para: "Las conclusiones de la última búsqueda de Rutas: la mejor opción según lo que priorices, qué cuesta ahorrar horas o escalas, dónde está lo barato y qué tan confiable es lo que estás viendo.",
    objetivo: "Decidir entre las opciones de una misma búsqueda sin leer la tabla entera, viendo qué se resigna en cada caso y si conviene comprar ahora o esperar.",
    noHace: "No busca nada por su cuenta: resume la última búsqueda hecha en Rutas.",
  },
  {
    id: "combinaciones",
    titulo: "Rutas sin precio",
    pregunta: "¿Qué rutas existen, aunque todavía no tengan precio?",
    para: "Todas las rutas que las aerolíneas vuelan hoy desde tu aeropuerto y los cercanos, sin fecha ni precio: para buscar a mano lo que el sistema todavía no tiene guardado.",
    objetivo: "Encontrar caminos que los precios guardados no cubren: qué aerolínea vuela cada tramo, por qué ciudad se puede hacer escala y qué rutas conviene buscar a mano.",
    noHace: "No tiene precios ni fechas: dice que la ruta existe, no cuánto cuesta ni si hay lugar.",
  },
  {
    id: "datos",
    titulo: "Datos",
    pregunta: "¿De dónde sale cada número?",
    para: "Para qué sirve cada pestaña, qué significa cada término y la ficha de cada dato: de dónde sale, cuándo se actualizó por última vez, qué tan exacto es y cada cuánto se refresca.",
    objetivo: "Saber cuánto confiar en cada número antes de decidir con él: qué es exacto, qué está vigente, qué es aproximado y qué es un supuesto declarado.",
    noHace: "No cambia nada de lo que se ve: es la ficha técnica.",
  },
];
