import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Busqueda } from "@az/core";
import { busquedaIdaYVuelta, cotizacionErrorLectura, cotizacionVerificada } from "@az/core/fixtures";
import { EstadoResultados } from "./EstadoResultados";

const con = (estado: Busqueda["estado"], motivoFallo: string | null = null, aviso: string | null = null): Busqueda => ({
  ...busquedaIdaYVuelta,
  estado,
  motivoFallo,
  aviso,
});

describe("EstadoResultados", () => {
  it("cargando: progreso real por combinación", () => {
    render(<EstadoResultados busqueda={con("corriendo")} cotizaciones={[cotizacionVerificada]} onReintentar={() => {}} onCargaManual={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Verificando 1 de 3 fechas");
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("cargando con aviso de captcha: lo muestra para que la persona lo resuelva", () => {
    render(<EstadoResultados busqueda={con("corriendo", null, "Captcha en jetsmart.com: resolvelo en la ventana de Chrome")} cotizaciones={[]} onReintentar={() => {}} onCargaManual={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Captcha en jetsmart.com");
  });

  it("vacío: mensaje con las fechas consultadas", () => {
    render(<EstadoResultados busqueda={con("completa")} cotizaciones={[]} onReintentar={() => {}} onCargaManual={() => {}} />);
    expect(screen.getByText("No se encontraron vuelos publicados para esta combinación.")).toBeTruthy();
    expect(screen.getByText(/Fechas consultadas/).textContent).toContain("01/01/2027 → 15/01/2027, 02/01/2027 → 15/01/2027");
  });

  it("parcial: precios verificados y sección aparte para las fechas fallidas", () => {
    render(
      <EstadoResultados
        busqueda={con("parcial")}
        cotizaciones={[cotizacionVerificada, cotizacionErrorLectura]}
        onReintentar={() => {}} onCargaManual={() => {}}
      />,
    );
    expect(screen.getAllByRole("row").length).toBe(2);
    const seccion = screen.getByRole("region", { name: "No verificado" });
    expect(seccion.textContent).toContain("02/01/2027 → 15/01/2027");
    expect(seccion.textContent).toContain("Error de lectura: No se encontró el selector del precio");
  });

  it("bloqueado: mensaje con hora del intento y botón de reintentar", () => {
    const reintentar = vi.fn();
    render(
      <EstadoResultados
        busqueda={con("bloqueada", "Challenge de Cloudflare")}
        cotizaciones={[{ ...cotizacionErrorLectura, estado: "bloqueado", motivo: "captcha" }]}
        onReintentar={reintentar} onCargaManual={() => {}}
      />,
    );
    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toContain("bloqueó la automatización");
    expect(alerta.textContent).toContain("Último intento: 14/09/2026");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });
});
