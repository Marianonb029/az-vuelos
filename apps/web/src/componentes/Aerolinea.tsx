import { Fragment } from "react";

export const TITULO_LOW_COST = "Perfil low cost (config fase6): la tarifa barata suele ser sólo con equipaje de mano; con valija de bodega la ventaja se pierde";

// Distintivo de low cost: se pone al lado del nombre de la aerolínea en Rutas y Combinaciones.
export const LowCost = () => (
  <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] font-semibold uppercase text-rose-800" title={TITULO_LOW_COST} data-testid="low-cost">
    low cost
  </span>
);

interface Props {
  codigos: readonly string[];
  nombre: (iata: string) => string;
  bajoCosto: readonly string[]; // cobertura.aerolineasBajoCosto
  separador?: string;
}

// Lista de aerolíneas por nombre, cada low cost con su distintivo.
export const Aerolineas = ({ codigos, nombre, bajoCosto, separador = ", " }: Props) => (
  <>
    {codigos.map((a, i) => (
      <Fragment key={`${a}-${i}`}>
        {i > 0 && separador}
        {nombre(a)}
        {bajoCosto.includes(a) && <LowCost />}
      </Fragment>
    ))}
  </>
);

export const tieneLowCost = (codigos: readonly string[], bajoCosto: readonly string[]) => codigos.some((a) => bajoCosto.includes(a));
