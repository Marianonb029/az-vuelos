import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ResultadoCalendario } from "@az/espacio";
import { CalendarioPresion } from "./CalendarioPresion";

const dia = (fecha: string, presion: number, banda: "verde" | "amarillo" | "rojo", fundamento = "Sin factores de presión conocidos"): ResultadoCalendario["puntajes"][number] => ({
  fecha,
  aeropuerto: "EZE",
  presion,
  etiquetas: [],
  banda,
  fundamento,
});

const resultado: ResultadoCalendario = {
  origen: "EZE",
  destino: "MAD",
  desde: "2027-01-30",
  hasta: "2027-02-05",
  calculadoEn: "2026-09-14T15:00:00.000Z",
  puntajes: [
    dia("2027-01-30", 35, "amarillo", "día sab (corredor SA_EU_verano_austral) +15 · receso en origen +20 = 35 (0–100: 35)"),
    dia("2027-01-31", 32, "verde"),
    dia("2027-02-01", 0, "verde"),
    dia("2027-02-02", 0, "verde"),
    dia("2027-02-03", 0, "verde"),
    dia("2027-02-04", 70, "rojo"),
    dia("2027-02-05", 15, "verde"),
  ],
  ventanasVerdes: [{ desde: "2027-01-31", hasta: "2027-02-03" }],
  avisos: ["Sin feriados de ES 2027: Nager.Date respondió HTTP 503 para ES 2027"],
};

afterEach(() => vi.unstubAllGlobals());

describe("CalendarioPresion", () => {
  it("consulta el rango, pinta un mes por grilla y muestra ventanas verdes, avisos y el detalle del día elegido", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(resultado) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<CalendarioPresion origen="EZE" destino="MAD" hoy="2026-09-14" />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2027-01-30" } });
    fireEvent.change(screen.getByLabelText(/Hasta/), { target: { value: "2027-02-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular presión" }));

    await waitFor(() => expect(screen.getByTestId("ventanas-verdes")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/espacio/calendario?origen=EZE&destino=MAD&desde=2027-01-30&hasta=2027-02-05");
    expect(screen.getByTestId("ventanas-verdes").textContent).toBe("Ventanas verdes: 31/01/2027 – 03/02/2027");
    expect(screen.getByRole("status").textContent).toContain("Sin feriados de ES 2027");
    expect(screen.getByText("enero 2027")).toBeTruthy();
    expect(screen.getByText("febrero 2027")).toBeTruthy();

    const rojo = screen.getByTitle(/04\/02\/2027 · presión 70 \(rojo\)/);
    expect(rojo.className).toContain("bg-red-300");
    fireEvent.click(screen.getByTitle(/30\/01\/2027 · presión 35/));
    expect(screen.getByTestId("detalle-dia").textContent).toContain("30/01/2027 · presión 35 · amarillo");
    expect(screen.getByTestId("detalle-dia").textContent).toContain("receso en origen +20");
  });

  it("muestra el error de la API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: "El calendario admite hasta 180 días" }) } as unknown as Response));
    render(<CalendarioPresion origen="EZE" destino="MAD" hoy="2026-09-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Calcular presión" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("El calendario admite hasta 180 días"));
  });
});
