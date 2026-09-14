import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Aerolinea, Aeropuerto } from "@az/core";
import { FormularioBusqueda } from "./FormularioBusqueda";

const aerolineas: Aerolinea[] = [
  { iata: "IB", nombre: "Iberia", icao: "IBE", alias: [] },
  { iata: "AR", nombre: "Aerolíneas Argentinas", icao: "ARG", alias: [] },
];
const aeropuertos: Aeropuerto[] = [
  { iata: "ASU", nombre: "Silvio Pettirossi International Airport", ciudad: "Asunción", pais: "Paraguay" },
  { iata: "MAD", nombre: "Adolfo Suárez Madrid–Barajas Airport", ciudad: "Madrid", pais: "Spain" },
];
const HOY = "2026-09-14";

const renderizar = (onEnviar = vi.fn()) => {
  render(
    <FormularioBusqueda
      aerolineas={aerolineas}
      aeropuertos={aeropuertos}
      adaptadores={new Set(["IB"])}
      hoy={HOY}
      enviando={false}
      onEnviar={onEnviar}
    />,
  );
  return onEnviar;
};

const elegirEnCombobox = (etiqueta: string, texto: string, opcion: RegExp) => {
  const input = screen.getByRole("combobox", { name: etiqueta });
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.click(screen.getByRole("option", { name: opcion }));
};

describe("FormularioBusqueda", () => {
  it("por defecto es ida y vuelta con carry on y muestra ambos calendarios", () => {
    renderizar();
    expect(screen.getByRole("radio", { name: "Ida y vuelta" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Carry on" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Fecha de ida/)).toBeTruthy();
    expect(screen.getByText("Fecha de vuelta")).toBeTruthy();
  });

  it("al enviar vacío muestra todos los errores en español", () => {
    const onEnviar = renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    const errores = screen.getAllByRole("alert").map((e) => e.textContent);
    expect(errores).toEqual([
      "Elegí una aerolínea",
      "Elegí un aeropuerto de origen",
      "Elegí un aeropuerto de destino",
      "Elegí la fecha de ida",
      "Elegí la fecha de vuelta",
    ]);
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("marca las aerolíneas sin adaptador como deshabilitadas con tooltip", () => {
    renderizar();
    fireEvent.change(screen.getByRole("combobox", { name: "Aerolínea" }), { target: { value: "a" } });
    const ar = screen.getByRole("option", { name: /Aerolíneas Argentinas/ });
    expect(ar.getAttribute("aria-disabled")).toBe("true");
    expect(ar.getAttribute("title")).toBe("adaptador no disponible");
    expect(screen.getByRole("option", { name: /Iberia/ }).getAttribute("aria-disabled")).toBeNull();
  });

  it("busca aeropuertos por ciudad y rechaza destino igual a origen", () => {
    renderizar();
    elegirEnCombobox("Origen", "asuncion", /ASU — Silvio Pettirossi/);
    elegirEnCombobox("Destino", "asu", /ASU — Silvio Pettirossi/);
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toContain("El destino debe ser distinto del origen");
  });

  it("envía una búsqueda válida de ida sola con el rango elegido en el calendario", () => {
    const onEnviar = renderizar();
    elegirEnCombobox("Aerolínea", "ib", /Iberia/);
    elegirEnCombobox("Origen", "asu", /ASU/);
    elegirEnCombobox("Destino", "mad", /MAD/);
    fireEvent.click(screen.getByRole("radio", { name: "Ida" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bodega" }));
    fireEvent.click(screen.getByRole("button", { name: "20/09/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "22/09/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onEnviar).toHaveBeenCalledWith({
      tipo: "busqueda",
      busqueda: {
        tipo: "ida",
        aerolineaIata: "IB",
        origenIata: "ASU",
        destinoIata: "MAD",
        equipaje: "bodega",
        rangoIda: { desde: "2026-09-20", hasta: "2026-09-22" },
        rangoVuelta: null,
      },
    });
  });

  it("comparar todas las aerolíneas: oculta el combo y envía los parámetros de ruta", () => {
    const onEnviar = renderizar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Comparar todas las aerolíneas/ }));
    expect(screen.queryByRole("combobox", { name: "Aerolínea" })).toBeNull();
    expect(screen.getByText(/Todas las aerolíneas con adaptador \(IB\)/)).toBeTruthy();
    elegirEnCombobox("Origen", "asu", /ASU/);
    elegirEnCombobox("Destino", "mad", /MAD/);
    fireEvent.click(screen.getByRole("radio", { name: "Ida" }));
    fireEvent.click(screen.getByRole("button", { name: "21/09/2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onEnviar).toHaveBeenCalledWith({
      tipo: "comparacion",
      parametros: {
        tipo: "ida",
        origenIata: "ASU",
        destinoIata: "MAD",
        equipaje: "carry_on",
        rangoIda: { desde: "2026-09-21", hasta: "2026-09-21" },
        rangoVuelta: null,
      },
    });
  });

  it("no permite fechas pasadas en el calendario", () => {
    renderizar();
    expect((screen.getAllByRole("button", { name: "13/09/2026" })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "14/09/2026" })[0] as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("FormularioBusqueda prellenado desde el espacio de búsqueda", () => {
  it("arranca con la combinación elegida y la envía tal cual al confirmar", () => {
    const onEnviar = vi.fn();
    render(
      <FormularioBusqueda
        aerolineas={aerolineas}
        aeropuertos={aeropuertos}
        adaptadores={new Set(["IB"])}
        hoy={HOY}
        enviando={false}
        onEnviar={onEnviar}
        iniciales={{ aerolineaIata: "IB", origenIata: "ASU", destinoIata: "MAD", tipo: "ida", rangoIda: { desde: "2027-01-25", hasta: "2027-01-28" }, rangoVuelta: null }}
      />,
    );
    expect((screen.getByRole("combobox", { name: "Aerolínea" }) as HTMLInputElement).value).toContain("Iberia");
    expect((screen.getByRole("combobox", { name: "Origen" }) as HTMLInputElement).value).toContain("ASU");
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onEnviar).toHaveBeenCalledWith({
      tipo: "busqueda",
      busqueda: expect.objectContaining({ aerolineaIata: "IB", origenIata: "ASU", destinoIata: "MAD", tipo: "ida", rangoIda: { desde: "2027-01-25", hasta: "2027-01-28" } }),
    });
  });
});
