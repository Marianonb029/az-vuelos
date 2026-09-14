interface Props<T extends string> {
  id: string;
  valor: T;
  opciones: { valor: T; etiqueta: string }[];
  onCambio: (v: T) => void;
}

export const Toggle = <T extends string>({ id, valor, opciones, onCambio }: Props<T>) => (
  <div id={id} role="radiogroup" className="inline-flex rounded-md border border-slate-300 p-0.5">
    {opciones.map((o) => (
      <button
        key={o.valor}
        type="button"
        role="radio"
        aria-checked={o.valor === valor}
        onClick={() => onCambio(o.valor)}
        className={`rounded px-3 py-1.5 text-sm ${
          o.valor === valor ? "bg-sky-600 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        {o.etiqueta}
      </button>
    ))}
  </div>
);
