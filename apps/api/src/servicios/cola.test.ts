import { describe, expect, it } from "vitest";
import { crearCola } from "./cola";

interface Control {
  id: string;
  terminar: () => void;
}

// Ejecutor de prueba: cada búsqueda queda abierta hasta que el test la termina.
const armar = (max = 2) => {
  const iniciadas: Control[] = [];
  const cola = crearCola(
    (id) =>
      new Promise<void>((resolver) => {
        iniciadas.push({ id, terminar: resolver });
      }),
    max,
  );
  return { cola, iniciadas };
};

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("crearCola", () => {
  it("corre hasta dos búsquedas de dominios distintos a la vez", async () => {
    const { cola, iniciadas } = armar();
    cola.encolar({ busquedaId: "a", dominio: "ar" });
    cola.encolar({ busquedaId: "b", dominio: "ib" });
    cola.encolar({ busquedaId: "c", dominio: "ja" });
    expect(iniciadas.map((x) => x.id)).toEqual(["a", "b"]);
    expect(cola.estado()).toEqual({ corriendo: 2, pendientes: 1, dominiosActivos: ["ar", "ib"] });
    iniciadas[0]?.terminar();
    await tick();
    expect(iniciadas.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("nunca corre dos búsquedas sobre el mismo dominio", async () => {
    const { cola, iniciadas } = armar();
    cola.encolar({ busquedaId: "a", dominio: "ar" });
    cola.encolar({ busquedaId: "b", dominio: "ar" });
    cola.encolar({ busquedaId: "c", dominio: "ib" });
    expect(iniciadas.map((x) => x.id)).toEqual(["a", "c"]);
    iniciadas[1]?.terminar();
    await tick();
    expect(iniciadas.map((x) => x.id)).toEqual(["a", "c"]);
    iniciadas[0]?.terminar();
    await tick();
    expect(iniciadas.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("un trabajo con tarea propia corre esa tarea y ocupa su dominio", async () => {
    const { cola, iniciadas } = armar(1);
    const corrida: string[] = [];
    cola.encolar({ busquedaId: "a", dominio: "www.kayak.com", correr: async () => { corrida.push("kayak:a"); } });
    cola.encolar({ busquedaId: "a", dominio: "ar" });
    await tick();
    expect(corrida).toEqual(["kayak:a"]);
    expect(iniciadas.map((x) => x.id)).toEqual(["a"]);
  });

  it("una excepción del ejecutor libera el lugar", async () => {
    const iniciadas: string[] = [];
    const cola = crearCola(async (id) => {
      iniciadas.push(id);
      if (id === "a") throw new Error("boom");
    }, 1);
    cola.encolar({ busquedaId: "a", dominio: "ar" });
    cola.encolar({ busquedaId: "b", dominio: "ar" });
    await tick();
    await tick();
    expect(iniciadas).toEqual(["a", "b"]);
  });
});
