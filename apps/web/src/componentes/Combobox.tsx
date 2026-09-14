import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export interface Opcion<T> {
  clave: string;
  valor: T;
  etiqueta: string;
  deshabilitada?: boolean;
  tooltip?: string;
  marca?: string;
}

interface Props<T> {
  id: string;
  placeholder: string;
  valor: T | null;
  etiquetaValor: (v: T) => string;
  buscar: (texto: string) => Opcion<T>[];
  onCambio: (v: T | null) => void;
  invalido?: boolean;
}

export const Combobox = <T,>({ id, placeholder, valor, etiquetaValor, buscar, onCambio, invalido }: Props<T>) => {
  const [texto, setTexto] = useState(valor === null ? "" : etiquetaValor(valor));
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const contenedor = useRef<HTMLDivElement>(null);

  // Sincroniza el texto cuando el padre fija un valor. Cuando el valor pasa a null es porque la persona
  // está tecleando sobre una elección previa: no hay que borrarle lo que escribe.
  useEffect(() => {
    if (valor !== null) setTexto(etiquetaValor(valor));
  }, [valor, etiquetaValor]);

  useEffect(() => {
    const cerrarSiAfuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", cerrarSiAfuera);
    return () => document.removeEventListener("mousedown", cerrarSiAfuera);
  });

  const opciones = abierto ? buscar(texto) : [];

  const cerrar = () => {
    setAbierto(false);
    setTexto(valor === null ? "" : etiquetaValor(valor));
  };

  const elegir = (o: Opcion<T>) => {
    if (o.deshabilitada) return;
    onCambio(o.valor);
    setTexto(o.etiqueta);
    setAbierto(false);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setAbierto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const o = opciones[activo];
      if (abierto && o) {
        e.preventDefault();
        elegir(o);
      }
    } else if (e.key === "Escape") {
      cerrar();
    }
  };

  return (
    <div ref={contenedor} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-invalid={invalido ? true : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
          if (valor !== null) onCambio(null);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 ${
          invalido ? "border-red-500" : "border-slate-300"
        }`}
      />
      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {opciones.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</li>}
          {opciones.map((o, i) => (
            <li
              key={o.clave}
              role="option"
              aria-selected={i === activo}
              aria-disabled={o.deshabilitada ? true : undefined}
              title={o.tooltip}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(o)}
              onMouseEnter={() => setActivo(i)}
              className={`flex items-center justify-between px-3 py-2 text-sm ${
                o.deshabilitada ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-800"
              } ${i === activo && !o.deshabilitada ? "bg-sky-50" : ""}`}
            >
              <span>{o.etiqueta}</span>
              {o.marca && (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">{o.marca}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
