import type { AeropuertoGeo, RutaCompacta } from "./modelos";

export interface Arista {
  destino: string;
  aerolineas: string[]; // todas, codeshares incluidos
  aerolineasOperadoras: string[]; // sin codeshares
  registros: number; // (aerolínea, ruta) distintos: base de la frecuencia proxy
  operadas: number; // registros sin codeshare
}

// Grafo dirigido de rutas en memoria: consultar salidas de un aeropuerto es O(1).
export class Grafo {
  private readonly salidas = new Map<string, Map<string, Arista>>();
  private readonly aeropuertos: ReadonlyMap<string, AeropuertoGeo>;

  constructor(rutas: readonly RutaCompacta[], aeropuertos: readonly AeropuertoGeo[]) {
    this.aeropuertos = new Map(aeropuertos.map((a) => [a.iata, a]));
    for (const [aerolinea, origen, destino, , codeshare] of rutas) {
      let porDestino = this.salidas.get(origen);
      if (!porDestino) {
        porDestino = new Map();
        this.salidas.set(origen, porDestino);
      }
      const arista = porDestino.get(destino) ?? { destino, aerolineas: [], aerolineasOperadoras: [], registros: 0, operadas: 0 };
      if (!arista.aerolineas.includes(aerolinea)) arista.aerolineas.push(aerolinea);
      arista.registros += 1;
      if (!codeshare) {
        if (!arista.aerolineasOperadoras.includes(aerolinea)) arista.aerolineasOperadoras.push(aerolinea);
        arista.operadas += 1;
      }
      porDestino.set(destino, arista);
    }
  }

  aeropuerto(iata: string): AeropuertoGeo | undefined {
    return this.aeropuertos.get(iata);
  }

  salidasDe(iata: string): Arista[] {
    return [...(this.salidas.get(iata)?.values() ?? [])];
  }

  arista(origen: string, destino: string): Arista | undefined {
    return this.salidas.get(origen)?.get(destino);
  }

  // Cantidad de registros (aerolínea, destino) que salen del aeropuerto: proxy de salidas semanales.
  registrosSalientes(iata: string): number {
    return this.salidasDe(iata).reduce((suma, a) => suma + a.registros, 0);
  }

  // Aerolíneas con al menos una salida desde el aeropuerto (Set A de la Fase 3).
  aerolineasEn(iata: string): string[] {
    return [...new Set(this.salidasDe(iata).flatMap((a) => a.aerolineas))].sort();
  }

  tieneVuelosInternacionales(iata: string): boolean {
    const pais = this.aeropuertos.get(iata)?.pais;
    if (!pais) return false;
    return this.salidasDe(iata).some((a) => this.aeropuertos.get(a.destino)?.pais !== pais);
  }
}
