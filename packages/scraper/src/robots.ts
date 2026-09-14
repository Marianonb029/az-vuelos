export interface VeredictoRobots {
  url: string;
  permitido: boolean;
  regla: string | null;
}

// Convierte una regla de robots.txt (con * y $) en expresión regular.
const aRegex = (ruta: string): RegExp => {
  const anclada = ruta.endsWith("$");
  const cuerpo = (anclada ? ruta.slice(0, -1) : ruta).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${cuerpo}${anclada ? "$" : ""}`);
};

// Evalúa las reglas del grupo User-agent: * para una URL. Sólo se registra; no bloquea (DECISIONES.md).
export const evaluarRobots = (textoRobots: string, urlObjetivo: string): VeredictoRobots => {
  const objetivo = new URL(urlObjetivo);
  const ruta = objetivo.pathname + objetivo.search;
  const lineas = textoRobots.split("\n").map((l) => l.replace(/#.*$/, "").trim());
  let enGrupoGeneral = false;
  const reglas: { tipo: "allow" | "disallow"; valor: string }[] = [];
  for (const linea of lineas) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(linea);
    if (!m) continue;
    const clave = (m[1] ?? "").toLowerCase();
    const valor = (m[2] ?? "").trim();
    if (clave === "user-agent") enGrupoGeneral = valor === "*";
    else if (enGrupoGeneral && (clave === "allow" || clave === "disallow") && valor !== "") {
      const soloRuta = valor.startsWith("http") ? new URL(valor).pathname : valor;
      const esOtroHost = valor.startsWith("http") && new URL(valor).host !== objetivo.host;
      if (!esOtroHost) reglas.push({ tipo: clave, valor: soloRuta });
    }
  }
  // Gana la regla más específica (más larga); ante empate, Allow.
  let ganadora: { tipo: "allow" | "disallow"; valor: string } | null = null;
  for (const r of reglas) {
    if (!aRegex(r.valor).test(ruta)) continue;
    if (ganadora === null || r.valor.length > ganadora.valor.length || (r.valor.length === ganadora.valor.length && r.tipo === "allow")) {
      ganadora = r;
    }
  }
  return {
    url: urlObjetivo,
    permitido: ganadora === null || ganadora.tipo === "allow",
    regla: ganadora === null ? null : `${ganadora.tipo === "allow" ? "Allow" : "Disallow"}: ${ganadora.valor}`,
  };
};

export const consultarRobots = async (urlObjetivo: string): Promise<VeredictoRobots> => {
  const origen = new URL(urlObjetivo).origin;
  try {
    const res = await fetch(`${origen}/robots.txt`);
    if (!res.ok) return { url: urlObjetivo, permitido: true, regla: null };
    return evaluarRobots(await res.text(), urlObjetivo);
  } catch {
    return { url: urlObjetivo, permitido: true, regla: null };
  }
};
