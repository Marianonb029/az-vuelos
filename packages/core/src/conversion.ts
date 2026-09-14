import type { Precio } from "./schema";

// Tabla de tasas USD → moneda, congelada para toda una búsqueda (regla 3).
export interface TablaFx {
  fuente: string;
  capturadaEn: string;
  usdA: Record<string, number>;
}

const redondear = (valor: number, decimales: number) => {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
};

export type ResultadoConversion = { ok: true; precio: Precio } | { ok: false; motivo: string };

export const convertirAUsd = (montoOriginal: number, monedaOriginal: string, tabla: TablaFx): ResultadoConversion => {
  if (monedaOriginal === "USD") {
    return { ok: true, precio: { montoOriginal, monedaOriginal, montoUsd: montoOriginal, fx: null } };
  }
  const usdAMoneda = tabla.usdA[monedaOriginal];
  if (usdAMoneda === undefined || usdAMoneda <= 0) {
    return { ok: false, motivo: `El proveedor de cambio no publica tasa para ${monedaOriginal}` };
  }
  const tasa = redondear(1 / usdAMoneda, 8);
  return {
    ok: true,
    precio: {
      montoOriginal,
      monedaOriginal,
      montoUsd: redondear(montoOriginal * tasa, 2),
      fx: { par: `${monedaOriginal}/USD`, tasa, fuente: tabla.fuente, capturadaEn: tabla.capturadaEn },
    },
  };
};
