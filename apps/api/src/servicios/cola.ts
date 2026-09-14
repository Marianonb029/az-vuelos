export interface Trabajo {
  busquedaId: string;
  dominio: string;
}

export const MAX_NAVEGADORES = 2;

// Cola en proceso: hasta 2 búsquedas a la vez y nunca dos sobre el mismo dominio.
export const crearCola = (ejecutar: (busquedaId: string) => Promise<void>, maxSimultaneos = MAX_NAVEGADORES) => {
  const pendientes: Trabajo[] = [];
  const dominiosActivos = new Set<string>();
  let corriendo = 0;

  const despachar = () => {
    while (corriendo < maxSimultaneos) {
      const indice = pendientes.findIndex((t) => !dominiosActivos.has(t.dominio));
      if (indice === -1) return;
      const [trabajo] = pendientes.splice(indice, 1);
      if (!trabajo) return;
      corriendo++;
      dominiosActivos.add(trabajo.dominio);
      ejecutar(trabajo.busquedaId)
        .catch((e: unknown) => console.error(`Búsqueda ${trabajo.busquedaId} terminó con excepción`, e))
        .finally(() => {
          corriendo--;
          dominiosActivos.delete(trabajo.dominio);
          despachar();
        });
    }
  };

  return {
    encolar(trabajo: Trabajo) {
      pendientes.push(trabajo);
      despachar();
    },
    estado() {
      return { corriendo, pendientes: pendientes.length, dominiosActivos: [...dominiosActivos] };
    },
  };
};

export type Cola = ReturnType<typeof crearCola>;
