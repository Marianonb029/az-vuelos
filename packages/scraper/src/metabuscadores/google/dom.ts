/// <reference lib="dom" />
// Corre DENTRO del navegador. Google Flights ofusca sus clases, pero cada fila trae un `aria-label`
// descriptivo y estable en inglés ("From 987 US dollars. 1 stop flight with … Leaves … at 9:45 AM on
// Tuesday, January 19 and arrives at … at 4:10 PM on Wednesday, January 20. Total duration 26 hr 25 min…").

export interface FilaGoogle {
  ariaLabel: string;
  texto: string; // texto visible de la fila: trae "ASU–MAD", "2 hr 50 min VVI", "Change of airport"…
}

export interface SnapshotGoogle {
  cargando: boolean;
  filas: FilaGoogle[];
  consentimiento: boolean; // página "Before you continue to Google"
  sinResultados: string | null;
}

export const leerFilasGoogle = (): SnapshotGoogle => {
  // Los nodos de texto se unen con espacio: `textContent` pegaría "ASUSilvio Pettirossi…–MADAdolfo…".
  const texto = (e: Element) => {
    const recorrido = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const partes: string[] = [];
    for (let n = recorrido.nextNode(); n !== null; n = recorrido.nextNode()) {
      const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t !== "") partes.push(t);
    }
    return partes.join(" ");
  };
  const filas = Array.from(document.querySelectorAll('ul[role="list"] > li'))
    .map((li) => ({ ariaLabel: li.querySelector('[role="link"][aria-label]')?.getAttribute("aria-label") ?? "", texto: texto(li).slice(0, 400) }))
    .filter((f) => /US dollars/.test(f.ariaLabel));
  const cuerpo = document.body.innerText;
  return {
    cargando: /Loading results/i.test(cuerpo),
    filas,
    consentimiento: /Before you continue to Google|Antes de continuar/i.test(cuerpo),
    sinResultados: /No results returned|no flights matching|No se han encontrado vuelos/i.exec(cuerpo)?.[0] ?? null,
  };
};
