import { spawn } from "node:child_process";

export interface DependenciasRefresco {
  fuentesVencidas: () => { comando: string | null }[]; // del servicio del espacio vigente
  recargar: () => void; // vuelve a leer los datasets
  raizRepo: string;
  cadaMs: number;
  avisar: (mensaje: string) => void;
}

// Refresco automático: cada `cadaMs` mira qué fuente venció y corre su comando (`pnpm catalogos`,
// `pnpm eventos`) una por vez; al terminar recarga los datasets en memoria. Nada más se automatiza.
export const iniciarRefresco = (dep: DependenciasRefresco) => {
  let corriendo = false;
  const correr = (comando: string) =>
    new Promise<boolean>((resolver) => {
      const [bin = "pnpm", ...args] = comando.split(" ");
      const proceso = spawn(bin, args, { cwd: dep.raizRepo, shell: true, stdio: "ignore" });
      proceso.on("exit", (codigo) => resolver(codigo === 0));
      proceso.on("error", () => resolver(false));
    });
  const ciclo = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      const comandos = [...new Set(dep.fuentesVencidas().map((f) => f.comando).filter((c): c is string => c !== null))];
      for (const comando of comandos) {
        dep.avisar(`Refresco automático: corriendo \`${comando}\``);
        const ok = await correr(comando);
        dep.avisar(ok ? `Refresco automático: \`${comando}\` terminó; datasets recargados` : `Refresco automático: \`${comando}\` falló; se reintenta en el próximo ciclo`);
        if (ok) dep.recargar();
      }
    } finally {
      corriendo = false;
    }
  };
  void ciclo();
  const temporizador = setInterval(() => void ciclo(), dep.cadaMs);
  return { detener: () => clearInterval(temporizador), ciclo };
};
