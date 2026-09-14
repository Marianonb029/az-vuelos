import type { ParamsBusqueda } from "../../adaptador";

export const DOMINIO = "https://www.iberia.com";

// Deep link del motor de reservas, tal como lo arma el buscador de iberia.com/ar (ibe_searcher-complete.js).
export const construirUrl = (p: ParamsBusqueda): string => {
  const idaYVuelta = p.tipo === "ida_y_vuelta" && p.fechaVuelta !== null;
  const [ai, mi, di] = p.fechaIda.split("-");
  const [av, mv, dv] = (p.fechaVuelta ?? "--").split("-");
  const q = new URLSearchParams({
    market: "AR",
    language: "es",
    appliesOMB: "false",
    splitEndCity: "false",
    initializedOMB: "true",
    flexible: "false",
    TRIP_TYPE: idaYVuelta ? "2" : "1",
    BEGIN_CITY_01: p.origenIata,
    END_CITY_01: p.destinoIata,
    BEGIN_DAY_01: di ?? "",
    BEGIN_MONTH_01: `${ai}${mi}`,
    BEGIN_YEAR_01: ai ?? "",
    END_DAY_01: idaYVuelta ? (dv ?? "") : "",
    END_MONTH_01: idaYVuelta ? `${av}${mv}` : "",
    END_YEAR_01: idaYVuelta ? (av ?? "") : "",
    FARE_TYPE: "R",
    quadrigam: "IBHMPA",
    ADT: "1",
  });
  return `${DOMINIO}/flights/?${q.toString()}`;
};

// El motor responde con "#!/ibbkerror" cuando su API de autenticación rechaza la sesión.
export const esPaginaDeError = (url: string, texto: string): boolean =>
  url.includes("ibbkerror") || /no podemos mostrarte los vuelos/i.test(texto);

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");

export const instruccion = (p: ParamsBusqueda): string => {
  const vuelta = p.tipo === "ida_y_vuelta" && p.fechaVuelta ? ` y vuelta el ${fechaCorta(p.fechaVuelta)}` : " (solo ida)";
  return `Iberia bloquea la búsqueda automática. En la ventana de Chrome buscá ${p.origenIata} → ${p.destinoIata}, ida el ${fechaCorta(p.fechaIda)}${vuelta}, 1 adulto; cuando veas los vuelos, la app lee la pantalla sola.`;
};
