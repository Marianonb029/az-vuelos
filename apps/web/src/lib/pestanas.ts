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
// de esa búsqueda, y al final las dos referencias (rutas posibles y la ficha de cada dato). Datos lo muestra tal cual.
export const PESTANAS: FichaPestana[] = [
  {
    id: "explorar",
    titulo: "Explorar precios",
    pregunta: "¿Cuándo y a dónde me conviene ir?",
    para: "Sin fecha: el precio más bajo de cada día del año, el mejor mes, a qué ciudad se llega más barato, desde qué aeropuerto conviene salir y si este par conviene comprarlo ahora o esperar.",
    objetivo: "Elegir cuándo viajar y a qué ciudad, cuando la fecha es flexible o el destino da igual. Es el único lugar donde se ve el año entero de una vez.",
    noHace: "No muestra vuelos concretos ni horarios: para eso está Rutas, a un clic de cualquier día.",
  },
  {
    id: "rutas",
    titulo: "Rutas",
    pregunta: "¿Qué hay para este día?",
    para: "Las combinaciones concretas de uno o dos boletos para el día elegido, ordenadas por salida, precio, equipaje, horas, escalas y aerolíneas, con el enlace para comprar y la antigüedad de cada tarifa.",
    objetivo: "Elegir el vuelo: comparar precio, horas, escalas y equipaje entre lo que el mercado tiene para ese día, y abrir la búsqueda en Aviasales para comprarlo.",
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
    titulo: "Combinaciones",
    pregunta: "¿Qué rutas existen, aunque no tengan precio?",
    para: "Todas las rutas que las aerolíneas vuelan hoy desde el origen y sus alternativos, sin fecha ni precio: para buscar a mano lo que el mercado todavía no tiene cacheado.",
    objetivo: "Encontrar caminos que el cache no cubre: qué aerolínea vuela cada tramo, por qué hub se puede pasar y qué rutas convendría buscar a mano en un metabuscador.",
    noHace: "No tiene precios ni fechas: dice que la ruta existe, no cuánto cuesta ni si hay lugar.",
  },
  {
    id: "datos",
    titulo: "Datos",
    pregunta: "¿De dónde sale cada número?",
    para: "Para qué sirve cada pestaña, el glosario de cada término y la ficha de cada dato: fuente, última actualización, exactitud y cada cuánto se refresca.",
    objetivo: "Saber cuánto confiar en cada número antes de decidir con él: qué es exacto, qué es vigente, qué es aproximado y qué es un supuesto declarado.",
    noHace: "No cambia nada de lo que se ve: es la ficha técnica.",
  },
];
