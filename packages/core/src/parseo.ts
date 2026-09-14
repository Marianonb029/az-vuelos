// Parsers de texto tal como aparece en los sitios. Devuelven null ante cualquier duda:
// un valor que no se pudo leer nunca se aproxima (regla 1).

// "1.520.361" → 1520361 · "1.234,56" → 1234.56 · "45.000" → 45000 · "842.50" → 842.5
export const parsearMonto = (texto: string): number | null => {
  const limpio = texto.replace(/[^\d.,]/g, "");
  if (limpio === "" || !/\d/.test(limpio)) return null;
  const puntos = limpio.split(".").length - 1;
  const comas = limpio.split(",").length - 1;
  let normalizado: string;
  if (puntos > 0 && comas > 0) {
    // Con ambos separadores, el último es el decimal.
    const decimalEsComa = limpio.lastIndexOf(",") > limpio.lastIndexOf(".");
    normalizado = decimalEsComa ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  } else if (puntos + comas === 0) {
    normalizado = limpio;
  } else {
    // Un solo tipo de separador: si aparece más de una vez o va seguido de exactamente
    // 3 dígitos ("45.000", "1,234") es de miles; si no, es decimal ("842.50", "1,5").
    const separador = puntos > 0 ? "." : ",";
    const repetido = puntos + comas > 1;
    const seguidoDeTres = limpio.length - limpio.lastIndexOf(separador) - 1 === 3;
    const esMiles = repetido || seguidoDeTres;
    normalizado = esMiles ? limpio.replace(/[.,]/g, "") : limpio.replace(",", ".");
  }
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
};

// "26h 25m" → 1585 · "1h 30m" → 90 · "45m" → 45 · "2h" → 120
export const parsearDuracion = (texto: string): number | null => {
  const horas = /(\d+)\s*h/i.exec(texto);
  const minutos = /(\d+)\s*m/i.exec(texto);
  if (!horas && !minutos) return null;
  const total = Number(horas?.[1] ?? 0) * 60 + Number(minutos?.[1] ?? 0);
  return total > 0 ? total : null;
};

// "Sin escalas" → 0 · "1 escala" → 1 · "2 escalas" → 2 · "Directo" → 0
export const parsearEscalas = (texto: string): number | null => {
  const t = texto.trim().toLowerCase();
  if (/^(sin escalas?|directo|non-?stop)$/.test(t)) return 0;
  const m = /^(\d+)\s+escalas?$/.exec(t);
  return m ? Number(m[1]) : null;
};

const DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

const indiceDia = (texto: string): number => {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return DIAS_SEMANA.findIndex((d) => t.includes(d));
};

// Días entre el nombre del día de salida y el de llegada ("Viernes" → "Sábado" = 1).
export const desfaseEntreDias = (diaSalida: string, diaLlegada: string): number | null => {
  const a = indiceDia(diaSalida);
  const b = indiceDia(diaLlegada);
  if (a === -1 || b === -1) return null;
  return (b - a + 7) % 7;
};

// "AR1341 / Embraer Embraer 190" → "AR1341"
export const parsearNumeroVuelo = (texto: string): string | null => {
  const m = /^([A-Z][A-Z0-9])\s?(\d{1,4}[A-Z]?)\b/.exec(texto.trim());
  return m ? `${m[1]}${m[2]}` : null;
};
