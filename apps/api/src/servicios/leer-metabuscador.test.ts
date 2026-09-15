import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { esLecturaLeida } from "@az/core";
import type { OfertaMetabuscador } from "@az/core";
import { busquedaIda } from "@az/core/fixtures";
import { ErrorBloqueo } from "@az/scraper";
import type { AdaptadorMetabuscador, ContextoNavegador, ResultadoMetabuscador } from "@az/scraper";
import { abrirDb } from "../db/conexion";
import { config } from "../config";
import { repoBusquedas } from "../repos/busquedas";
import { repoLecturasMetabuscador } from "../repos/lecturas-metabuscador";
import { repoRegistros } from "../repos/registros";
import { leerMetabuscador } from "./leer-metabuscador";

const oferta: OfertaMetabuscador = {
  posicion: 1,
  aerolineas: ["Iberia"],
  precio: { montoOriginal: 902, monedaOriginal: "USD", montoUsd: 902, fx: null },
  tarifa: "Economy",
  tramos: [{ origenIata: "ASU", destinoIata: "MAD", salida: "23:55", llegada: "16:10", desfaseDias: 1, escalas: 0, viaIatas: [], duracionMin: 735 }],
  transbordoPorCuentaPropia: false,
  etiquetas: ["Best"],
  textoCrudo: "Iberia 11:55 pm – 4:10 pm nonstop $902",
};

const pagina = () => ({ url: () => "https://www.kayak.com/flights/ASU-MAD/2027-01-01", screenshot: async () => Buffer.from("") }) as unknown as ContextoNavegador["pages"] extends () => (infer P)[] ? P : never;
const navegador = () => ({ pages: () => [pagina()], newPage: async () => pagina(), close: async () => {} }) as unknown as ContextoNavegador;

const armar = (leer: AdaptadorMetabuscador["leer"]) => {
  const db = abrirDb(":memory:", config.directorioMigraciones);
  const busquedas = repoBusquedas(db);
  busquedas.crear({ ...busquedaIda, estado: "completa" }); // ida 01–03/01/2027: 3 fechas
  const m: AdaptadorMetabuscador = { ref: { id: "kayak", nombre: "Kayak" }, dominios: ["www.kayak.com"], urlBusqueda: () => "https://www.kayak.com/flights/x", leer };
  const dep = {
    busquedas,
    lecturas: repoLecturasMetabuscador(db),
    registros: repoRegistros(db),
    abrirNavegador: vi.fn(async () => navegador()),
    directorioEvidencia: mkdtempSync(join(tmpdir(), "az-meta-")),
    directorioPerfil: mkdtempSync(join(tmpdir(), "az-perfil-")),
    pausa: vi.fn(async () => {}),
    asistido: false,
    avisar: vi.fn(),
  };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("User-agent: *\nDisallow: /flights/", { status: 200 }));
  return { dep, m };
};

const leida = (p: { rutaScreenshot: string }): ResultadoMetabuscador => ({
  estado: "leida",
  ofertas: [oferta],
  totalOfertas: 486,
  evidencia: { url: "https://www.kayak.com/flights/ASU-MAD/2027-01-01", capturadoEn: new Date().toISOString(), screenshotPath: p.rutaScreenshot, selector: ".nrc6", textoCrudo: oferta.textoCrudo },
});

describe("leerMetabuscador", () => {
  it("lee cada fecha, guarda la evidencia relativa y registra robots; una segunda corrida no repite lecturas vigentes", async () => {
    const leer = vi.fn(async (p: { rutaScreenshot: string }) => leida(p));
    const { dep, m } = armar(leer);
    await leerMetabuscador(dep, busquedaIda.id, m);
    const lecturas = dep.lecturas.listar(busquedaIda.id, "kayak");
    expect(lecturas).toHaveLength(3);
    expect(lecturas.map((l) => l.fechaIda)).toEqual(["2027-01-01", "2027-01-02", "2027-01-03"]);
    const primera = lecturas[0];
    expect(primera && esLecturaLeida(primera) ? primera.evidencia.screenshotPath : null).toBe(`${busquedaIda.id}/kayak/1.png`);
    expect(dep.pausa).toHaveBeenCalledTimes(2);
    expect(dep.abrirNavegador).toHaveBeenCalledWith(join(dep.directorioPerfil, "www.kayak.com"));

    await leerMetabuscador(dep, busquedaIda.id, m);
    expect(leer).toHaveBeenCalledTimes(3);
    expect(dep.abrirNavegador).toHaveBeenCalledTimes(1); // nada pendiente: no abre Chrome
  });

  it("un bloqueo corta la corrida y queda como lectura bloqueada de esa fecha", async () => {
    const leer = vi.fn(async (p: { rutaScreenshot: string; fechaIda: string }) => {
      if (p.fechaIda === "2027-01-02") throw new ErrorBloqueo("captcha: Elemento div#px-captcha", "https://www.kayak.com/x");
      return leida(p);
    });
    const { dep, m } = armar(leer);
    await leerMetabuscador(dep, busquedaIda.id, m);
    const lecturas = dep.lecturas.listar(busquedaIda.id, "kayak");
    expect(lecturas.map((l) => l.estado)).toEqual(["leida", "bloqueado"]);
    expect(lecturas[1]).toMatchObject({ fechaIda: "2027-01-02", motivo: "captcha: Elemento div#px-captcha" });
  });

  it("una excepción del lector se registra como error_lectura con intento fallido y sigue con la próxima fecha", async () => {
    const leer = vi.fn(async (p: { rutaScreenshot: string; fechaIda: string }) => {
      if (p.fechaIda === "2027-01-01") throw new Error("Kayak mostró 12 tarjetas pero ninguna se pudo leer completa");
      return leida(p);
    });
    const { dep, m } = armar(leer);
    await leerMetabuscador(dep, busquedaIda.id, m);
    const lecturas = dep.lecturas.listar(busquedaIda.id, "kayak");
    expect(lecturas.map((l) => l.estado)).toEqual(["error_lectura", "leida", "leida"]);
    expect(dep.registros.intentosFallidosDe(busquedaIda.id)).toBe(1);
  });
});
