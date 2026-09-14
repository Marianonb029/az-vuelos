import { afterEach, describe, expect, it, vi } from "vitest";
import { crearServicioFeriados } from "./feriados";

const respuesta = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) }) as unknown as Response;

const nager = [
  { date: "2027-01-01", localName: "Año Nuevo", name: "New Year's Day", countryCode: "AR", global: true },
  { date: "2027-06-20", localName: "Día de la Bandera", name: "Flag Day", countryCode: "AR", global: true },
  { date: "2027-03-19", localName: "San José", name: "St Joseph", countryCode: "ES", global: false },
];

afterEach(() => vi.unstubAllGlobals());

describe("servicio de feriados (Nager.Date)", () => {
  it("trae los feriados nacionales de cada (año, país) una sola vez", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(nager));
    vi.stubGlobal("fetch", fetchMock);
    const servicio = crearServicioFeriados("https://nager.test");
    const r1 = await servicio.obtener(["AR", "AR"], [2027]);
    const r2 = await servicio.obtener(["AR"], [2027]);
    expect(r1.feriados.map((f) => f.nombre)).toEqual(["Año Nuevo", "Día de la Bandera"]); // el regional (global=false) no entra
    expect(r1.avisos).toEqual([]);
    expect(r2.feriados).toEqual(r1.feriados);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://nager.test/2027/AR");
  });

  it("un país sin datos deja aviso, no inventa feriados, y no queda cacheado", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respuesta(null, 404)).mockResolvedValueOnce(respuesta(nager));
    vi.stubGlobal("fetch", fetchMock);
    const servicio = crearServicioFeriados("https://nager.test");
    const r1 = await servicio.obtener(["PY"], [2027]);
    expect(r1.feriados).toEqual([]);
    expect(r1.avisos).toEqual(["Sin feriados de PY 2027: Nager.Date no tiene feriados de PY para 2027"]);
    const r2 = await servicio.obtener(["PY"], [2027]);
    expect(r2.feriados).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
