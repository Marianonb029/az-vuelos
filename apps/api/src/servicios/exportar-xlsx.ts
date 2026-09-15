import ExcelJS from "exceljs";
import type { CorridaEspacio, PuntajeDia } from "@az/espacio";

// combinations.xlsx del SPEC (sección 8): una hoja por fase. Todo lo que hay acá ya está en el JSON;
// la planilla es la misma información con formato, para la persona que trabajaba con la original.

const RELLENO_BANDA: Record<PuntajeDia["banda"], string> = { verde: "FFC6EFCE", amarillo: "FFFFEB9C", rojo: "FFFFC7CE" };

const encabezado = (hoja: ExcelJS.Worksheet, columnas: { header: string; key: string; width?: number }[]) => {
  hoja.columns = columnas.map((c) => ({ ...c, width: c.width ?? 14 }));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
};

const hojaResumen = (libro: ExcelJS.Workbook, c: CorridaEspacio) => {
  const hoja = libro.addWorksheet("Resumen");
  encabezado(hoja, [
    { header: "Parámetro", key: "p", width: 34 },
    { header: "Valor", key: "v", width: 60 },
  ]);
  const { espacio, calendario, combinaciones } = c;
  const filas: [string, string | number][] = [
    ["Origen pedido", espacio.origen],
    ["Destino pedido", espacio.destino],
    ["Ventana de ida pedida", `${combinaciones.ventanaPedida.desde} a ${combinaciones.ventanaPedida.hasta}`],
    ["Calendario evaluado", `${calendario.desde} a ${calendario.hasta}`],
    ["Fecha de corrida", c.calculadoEn],
    ["Orígenes candidatos", espacio.origenes.length],
    ["Destinos candidatos", espacio.destinos.length],
    ["Rutas Nivel 1–2", espacio.rutas.conservadas.length],
    ["Rutas Nivel 3–4 persistidas", espacio.rutas.descartadas.length],
    ["Gaps de aerolíneas", espacio.gaps.length],
    ["Ventanas verdes (origen pedido)", calendario.ventanasVerdes.map((v) => `${v.desde} a ${v.hasta}`).join("; ") || "ninguna"],
    ["Combinaciones", combinaciones.combinaciones.length],
    ["Avisos", [...calendario.avisos, ...combinaciones.avisos].join("; ") || "ninguno"],
    ["Fuentes", "OurAirports (geografía), OpenFlights routes.dat 2014 (rutas posibles), Nager.Date (feriados), config/espacio.json (SPEC)"],
  ];
  for (const [p, v] of filas) hoja.addRow({ p, v });
};

const hojaAeropuertos = (libro: ExcelJS.Workbook, c: CorridaEspacio) => {
  const hoja = libro.addWorksheet("Aeropuertos");
  encabezado(hoja, [
    { header: "Rol", key: "rol", width: 10 },
    { header: "Posición", key: "posicion", width: 10 },
    { header: "IATA", key: "iata", width: 8 },
    { header: "Nombre", key: "nombre", width: 44 },
    { header: "Ciudad", key: "ciudad", width: 22 },
    { header: "País", key: "pais", width: 6 },
    { header: "Distancia km", key: "distancia", width: 12 },
    { header: "Salidas/sem (proxy)", key: "salidas", width: 18 },
    { header: "Pedido", key: "pedido", width: 8 },
  ]);
  for (const cand of [...c.espacio.origenes, ...c.espacio.destinos]) {
    hoja.addRow({ rol: cand.rol, posicion: cand.posicion, iata: cand.aeropuerto.iata, nombre: cand.aeropuerto.nombre, ciudad: cand.aeropuerto.ciudad, pais: cand.aeropuerto.pais, distancia: cand.distanciaKm, salidas: cand.salidasSemanales, pedido: cand.esSolicitado ? "sí" : "" });
  }
};

const hojaRutas = (libro: ExcelJS.Workbook, c: CorridaEspacio) => {
  const hoja = libro.addWorksheet("Rutas N1-N2");
  encabezado(hoja, [
    { header: "Origen", key: "origen", width: 8 },
    { header: "Nivel", key: "nivel", width: 7 },
    { header: "Etiqueta", key: "etiqueta", width: 10 },
    { header: "Destino", key: "destino", width: 8 },
    { header: "Ciudad destino", key: "ciudad", width: 22 },
    { header: "Vía", key: "via", width: 8 },
    { header: "Aerolíneas", key: "aerolineas", width: 20 },
    { header: "Vuelos/sem (proxy)", key: "vuelos", width: 16 },
    { header: "Conservada", key: "conservada", width: 11 },
    { header: "Fuente", key: "fuente", width: 12 },
  ]);
  const ciudad = new Map(c.espacio.destinos.map((d) => [d.aeropuerto.iata, d.aeropuerto.ciudad]));
  for (const [lista, conservada] of [[c.espacio.rutas.conservadas, "sí"], [c.espacio.rutas.descartadas, "no (N3–4)"]] as const) {
    for (const r of lista) hoja.addRow({ origen: r.origen, nivel: r.nivel, etiqueta: r.etiquetaNivel, destino: r.destino, ciudad: ciudad.get(r.destino) ?? "", via: r.via ?? "directa", aerolineas: r.aerolineas.join(", "), vuelos: r.vuelosSemanales, conservada, fuente: r.fuente });
  }
};

const hojaGaps = (libro: ExcelJS.Workbook, c: CorridaEspacio) => {
  const hoja = libro.addWorksheet("Aerolíneas y Gaps");
  encabezado(hoja, [
    { header: "Rol", key: "rol", width: 16 },
    { header: "Prioridad", key: "prioridad", width: 11 },
    { header: "IATA", key: "iata", width: 6 },
    { header: "Aerolínea", key: "nombre", width: 28 },
    { header: "Opera en", key: "operaEn", width: 16 },
    { header: "Hub", key: "hub", width: 6 },
    { header: "Cubre destino", key: "cubre", width: 13 },
    { header: "Boletos separados", key: "separados", width: 16 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Hipótesis", key: "hipotesis", width: 80 },
  ]);
  for (const g of c.espacio.gaps) hoja.addRow({ rol: g.rol, prioridad: g.prioridad, iata: g.aerolinea, nombre: g.nombre, operaEn: g.operaEn.join(", "), hub: g.hub ?? "", cubre: g.cubreRutasObjetivo ? "sí" : "no", separados: g.requiereBoletosSeparados ? "sí" : "no", estado: g.estado, hipotesis: g.hipotesis });
};

const hojaCalendario = (libro: ExcelJS.Workbook, c: CorridaEspacio) => {
  const hoja = libro.addWorksheet("Calendario");
  encabezado(hoja, [
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Aeropuerto", key: "aeropuerto", width: 11 },
    { header: "Presión", key: "presion", width: 9 },
    { header: "Banda", key: "banda", width: 10 },
    { header: "Etiquetas", key: "etiquetas", width: 60 },
    { header: "Fundamento", key: "fundamento", width: 90 },
  ]);
  for (const p of c.calendario.puntajes) {
    const fila = hoja.addRow({ fecha: p.fecha, aeropuerto: p.aeropuerto, presion: p.presion, banda: p.banda, etiquetas: p.etiquetas.join("; "), fundamento: p.fundamento });
    fila.getCell("banda").fill = { type: "pattern", pattern: "solid", fgColor: { argb: RELLENO_BANDA[p.banda] } };
  }
};

const hojaCombinaciones = (libro: ExcelJS.Workbook, c: CorridaEspacio) => {
  const hoja = libro.addWorksheet("Combinaciones");
  encabezado(hoja, [
    { header: "Puntaje", key: "puntaje", width: 8 },
    { header: "Origen", key: "origen", width: 8 },
    { header: "Destino", key: "destino", width: 8 },
    { header: "Aerolínea", key: "aerolinea", width: 10 },
    { header: "Nombre", key: "nombre", width: 26 },
    { header: "Vía", key: "via", width: 8 },
    { header: "Nivel", key: "nivel", width: 7 },
    { header: "Ida desde", key: "desde", width: 12 },
    { header: "Ida hasta", key: "hasta", width: 12 },
    { header: "Confianza", key: "confianza", width: 10 },
    { header: "Traslado", key: "traslado", width: 40 },
    { header: "Boletos separados", key: "separados", width: 16 },
    { header: "Fundamento", key: "fundamento", width: 90 },
  ]);
  const nombres = new Map(c.combinaciones.nombres.map((n) => [n.iata, n.nombre]));
  for (const x of c.combinaciones.combinaciones) {
    hoja.addRow({ puntaje: x.puntaje, origen: x.origen, destino: x.destino, aerolinea: x.aerolinea, nombre: nombres.get(x.aerolinea) ?? x.aerolinea, via: x.via ?? "directa", nivel: x.nivelRuta ?? "gap", desde: x.ventanaIda.desde, hasta: x.ventanaIda.hasta, confianza: x.confianza, traslado: x.notaTraslado ?? "", separados: x.requiereBoletosSeparados ? "sí" : "no", fundamento: x.fundamento });
  }
};

export const exportarXlsx = async (c: CorridaEspacio): Promise<Buffer> => {
  const libro = new ExcelJS.Workbook();
  libro.creator = "AZ Vuelos";
  libro.created = new Date(c.calculadoEn);
  hojaResumen(libro, c);
  hojaAeropuertos(libro, c);
  hojaRutas(libro, c);
  hojaGaps(libro, c);
  hojaCalendario(libro, c);
  hojaCombinaciones(libro, c);
  return Buffer.from(await libro.xlsx.writeBuffer());
};
