import type { ReactNode } from "react";

interface Props {
  id: string;
  etiqueta: string;
  error?: string | undefined;
  children: ReactNode;
}

export const Campo = ({ id, etiqueta, error, children }: Props) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-sm font-medium text-slate-700">
      {etiqueta}
    </label>
    {children}
    {error && (
      <p role="alert" className="text-xs text-red-600">
        {error}
      </p>
    )}
  </div>
);
