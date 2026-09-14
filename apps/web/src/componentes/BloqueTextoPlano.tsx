import { useState } from "react";
import { textoPlano } from "@az/core";
import type { CotizacionVerificada } from "@az/core";

export const BloqueTextoPlano = ({ cotizacion }: { cotizacion: CotizacionVerificada }) => {
  const [copiado, setCopiado] = useState(false);
  const texto = textoPlano(cotizacion);

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2">
      <pre data-testid="texto-plano" className="whitespace-pre rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
        {texto}
      </pre>
      <button
        type="button"
        onClick={copiar}
        className="self-start rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
      >
        {copiado ? "Copiado" : "Copiar al portapapeles"}
      </button>
    </div>
  );
};
