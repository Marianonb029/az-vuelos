import type { ConfigEspacio } from "./configuracion";
import type { CandidatoAeropuerto, Combinacion, GapAerolinea, PuntajeDia, Ruta, Ventana } from "./modelos";

export interface EntradaFase6 {
  origenes: readonly CandidatoAeropuerto[];
  destinos: readonly CandidatoAeropuerto[];
  rutas: readonly Ruta[]; // Nivel 1–2
  gaps: readonly GapAerolinea[];
  ventanaPedida: Ventana; // la fecha (o rango) de ida que pidió la persona: siempre se conserva
  calendarios: ReadonlyMap<string, readonly PuntajeDia[]>; // por aeropuerto de origen
  ventanasVerdes: ReadonlyMap<string, readonly Ventana[]>; // por aeropuerto de origen
}

const PUNTOS_NIVEL: Record<number, number> = { 1: 1, 2: 0.6 }; // SPEC: Nivel 1 = 30, Nivel 2 = 18 sobre peso 30

const presionMedia = (calendario: readonly PuntajeDia[] | undefined, v: Ventana): number | null => {
  const dias = (calendario ?? []).filter((p) => p.fecha >= v.desde && p.fecha <= v.hasta);
  if (dias.length === 0) return null;
  return dias.reduce((s, p) => s + p.presion, 0) / dias.length;
};

interface Semilla {
  origen: CandidatoAeropuerto;
  destino: CandidatoAeropuerto;
  aerolinea: string;
  nivel: Ruta["nivel"] | null;
  via: string | null;
  gap: GapAerolinea | null;
}

const semillasDeRutas = (entrada: EntradaFase6): Semilla[] => {
  const porIata = (lista: readonly CandidatoAeropuerto[]) => new Map(lista.map((c) => [c.aeropuerto.iata, c]));
  const origenes = porIata(entrada.origenes);
  const destinos = porIata(entrada.destinos);
  const semillas: Semilla[] = [];
  for (const r of entrada.rutas) {
    const origen = origenes.get(r.origen);
    const destino = destinos.get(r.destino);
    if (!origen || !destino) continue;
    for (const aerolinea of r.aerolineas) semillas.push({ origen, destino, aerolinea, nivel: r.nivel, via: r.via, gap: null });
  }
  return semillas;
};

// Un gap de origen que cubre el destino pedido genera una combinación (origen donde opera → destino pedido).
const semillasDeGaps = (entrada: EntradaFase6): Semilla[] => {
  const destino = entrada.destinos.find((d) => d.esSolicitado);
  if (!destino) return [];
  const semillas: Semilla[] = [];
  for (const g of entrada.gaps) {
    if (g.rol !== "gap_origen" || !g.cubreRutasObjetivo || g.estado === "descartada") continue;
    const origen = entrada.origenes.find((o) => g.operaEn.includes(o.aeropuerto.iata)) ?? entrada.origenes.find((o) => o.esSolicitado);
    if (!origen) continue;
    semillas.push({ origen, destino, aerolinea: g.aerolinea, nivel: null, via: g.hub, gap: g });
  }
  return semillas;
};

const puntuar = (s: Semilla, ventana: Ventana, entrada: EntradaFase6, cfg: ConfigEspacio["fase6"]): Combinacion => {
  const p = cfg.pesos;
  const desglose: Record<string, number> = {};
  const notas: string[] = [];
  const anotar = (clave: string, puntos: number, nota: string) => {
    if (puntos === 0) return;
    desglose[clave] = Math.round(puntos * 10) / 10;
    notas.push(`${nota} ${puntos > 0 ? "+" : ""}${Math.round(puntos)}`);
  };

  if (s.nivel !== null) anotar("nivelRuta", (p["nivelRuta"] ?? 0) * (PUNTOS_NIVEL[s.nivel] ?? 0), `ruta Nivel ${s.nivel}`);
  const presion = presionMedia(entrada.calendarios.get(s.origen.aeropuerto.iata), ventana);
  if (presion !== null) anotar("presionInversa", ((p["presionInversa"] ?? 0) * (100 - presion)) / 100, `presión media ${Math.round(presion)}`);
  if (cfg.aerolineasPerfilBajoCosto.includes(s.aerolinea)) anotar("perfilPrecioAerolinea", p["perfilPrecioAerolinea"] ?? 0, "aerolínea con perfil de ofertas");

  const extremosPedidos = Number(s.origen.esSolicitado) + Number(s.destino.esSolicitado);
  if (extremosPedidos > 0) anotar("aeropuertoSolicitado", ((p["aeropuertoSolicitado"] ?? 0) * extremosPedidos) / 2, extremosPedidos === 2 ? "aeropuertos pedidos" : "un aeropuerto pedido");
  const kmTraslado = (s.origen.esSolicitado ? 0 : s.origen.distanciaKm) + (s.destino.esSolicitado ? 0 : s.destino.distanciaKm);
  if (kmTraslado > 0) anotar("penalizacionDistancia", ((p["penalizacionDistancia"] ?? 0) * kmTraslado) / cfg.kmPorPenalizacionTraslado, `${kmTraslado} km de traslado`);

  const boletosSeparados = s.gap?.requiereBoletosSeparados ?? false;
  if (boletosSeparados) anotar("penalizacionBoletosSeparados", p["penalizacionBoletosSeparados"] ?? 0, "boletos separados");
  if (s.gap) {
    anotar("bonoDescubrimientoGap", p["bonoDescubrimientoGap"] ?? 0, "descubierta por gap");
    if (s.gap.estado !== "confirmada") anotar("penalizacionSinVerificar", p["penalizacionSinVerificar"] ?? 0, "sin verificar en vivo");
  }

  const total = Object.values(desglose).reduce((a, b) => a + b, 0);
  const puntaje = Math.max(0, Math.min(100, Math.round(total)));
  const traslados = [
    s.origen.esSolicitado ? null : `salida desde ${s.origen.aeropuerto.iata}, a ${s.origen.distanciaKm} km del pedido`,
    s.destino.esSolicitado ? null : `llegada a ${s.destino.aeropuerto.iata}, a ${s.destino.distanciaKm} km del pedido`,
  ].filter((t): t is string => t !== null);

  return {
    id: `${s.origen.aeropuerto.iata}-${s.destino.aeropuerto.iata}-${s.aerolinea}-${ventana.desde}`,
    origen: s.origen.aeropuerto.iata,
    destino: s.destino.aeropuerto.iata,
    aerolinea: s.aerolinea,
    nivelRuta: s.nivel,
    via: s.via,
    ventanaIda: ventana,
    ventanaVuelta: null,
    puntaje,
    desglose,
    fundamento: `${notas.join(" · ")} = ${Math.round(total)}${s.gap ? `. Hipótesis: ${s.gap.hipotesis}` : ""}`,
    requiereTrasladoTerrestre: traslados.length > 0,
    notaTraslado: traslados.length === 0 ? null : traslados.join("; "),
    requiereBoletosSeparados: boletosSeparados,
    confianza: s.gap && s.gap.estado !== "confirmada" ? "baja" : "alta",
  };
};

// Fase 6: ruta × aerolínea × ventana (la pedida más las verdes del origen), puntuadas 0–100 con los
// pesos de config; deduplicadas por (origen, destino, aerolínea, ventana) quedándose con la mejor ruta.
export const generarCombinaciones = (entrada: EntradaFase6, cfg: ConfigEspacio["fase6"]): Combinacion[] => {
  const semillas = [...semillasDeRutas(entrada), ...semillasDeGaps(entrada)];
  const vistas = new Map<string, Combinacion>();
  for (const s of semillas) {
    const verdes = entrada.ventanasVerdes.get(s.origen.aeropuerto.iata) ?? [];
    const ventanas = [entrada.ventanaPedida, ...verdes.filter((v) => v.desde !== entrada.ventanaPedida.desde || v.hasta !== entrada.ventanaPedida.hasta)];
    for (const ventana of ventanas) {
      const c = puntuar(s, ventana, entrada, cfg);
      const previa = vistas.get(c.id);
      if (!previa || previa.puntaje < c.puntaje) vistas.set(c.id, c);
    }
  }
  return [...vistas.values()]
    .sort((a, b) => b.puntaje - a.puntaje || a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino) || a.aerolinea.localeCompare(b.aerolinea))
    .slice(0, cfg.maxCombinaciones);
};
