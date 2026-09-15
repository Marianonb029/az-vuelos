import { useState } from "react";
import type { FormEvent } from "react";
import { combinaciones, fechaCorta, fechaHoraCorta } from "@az/core";
import type { Busqueda, CargaManual as DatosCarga, Cotizacion, CotizacionManual } from "@az/core";
import { cargarManual } from "../lib/api";

export interface CapturaGuardada {
  ruta: string; // relativa a evidencia
  capturadoEn: string;
  url: string | null;
}

interface Props {
  busqueda: Busqueda;
  onCargada: (busqueda: Busqueda, cotizacion: CotizacionManual) => void;
  capturas?: CapturaGuardada[]; // guardadas por una lectura asistida de esta búsqueda
}

const describirError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// "2026-09-14T15:30" local → ISO con zona.
const localAIso = (local: string) => new Date(local).toISOString();
// Instante → "AAAA-MM-DDTHH:MM" en hora local, para datetime-local.
const aLocal = (f: Date) => {
  f.setSeconds(0, 0);
  return new Date(f.getTime() - f.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const ahoraLocal = () => aLocal(new Date());

const leerImagen = (archivo: File): Promise<DatosCarga["imagen"]> =>
  new Promise((resolver, rechazar) => {
    const tipo = archivo.type;
    if (tipo !== "image/png" && tipo !== "image/jpeg") return rechazar(new Error("La captura debe ser PNG o JPEG"));
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("No se pudo leer la captura"));
    lector.onload = () => resolver({ tipo, base64: String(lector.result).split(",")[1] ?? "" });
    lector.readAsDataURL(archivo);
  });

const claveFecha = (c: Pick<Cotizacion, "fechaIda" | "fechaVuelta">) => `${c.fechaIda}|${c.fechaVuelta ?? ""}`;

// Carga a mano de un precio leído en el sitio oficial. Los cuatro datos de evidencia son obligatorios:
// URL, captura, monto y hora. Sin ellos el botón no envía nada.
export const CargaManual = ({ busqueda, onCargada, capturas = [] }: Props) => {
  const combos = combinaciones(busqueda);
  const [capturaGuardada, setCapturaGuardada] = useState<string | null>(capturas[0]?.ruta ?? null);
  const [fecha, setFecha] = useState(combos[0] ? claveFecha(combos[0]) : "");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [url, setUrl] = useState(capturas[0]?.url ?? "");
  const [capturadoEn, setCapturadoEn] = useState(capturas[0] ? aLocal(new Date(capturas[0].capturadoEn)) : ahoraLocal());
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faltantes = [
    !fecha && "la fecha",
    !(Number(monto.replace(",", ".")) > 0) && "el monto",
    !/^[A-Z]{3}$/.test(moneda) && "la moneda (3 letras)",
    !/^https?:\/\//.test(url) && "la URL del sitio oficial",
    !capturadoEn && "la hora en que viste el precio",
    !archivo && capturaGuardada === null && "la captura de pantalla",
  ].filter((f): f is string => typeof f === "string");

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (faltantes.length > 0) {
      setError(`Falta ${faltantes.join(", ")}`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const [fechaIda = "", vuelta = ""] = fecha.split("|");
      const r = await cargarManual(busqueda.id, {
        fechaIda,
        fechaVuelta: vuelta === "" ? null : vuelta,
        monto: Number(monto.replace(",", ".")),
        moneda,
        url,
        capturadoEn: localAIso(capturadoEn),
        nota,
        imagen: archivo ? await leerImagen(archivo) : null,
        capturaGuardada: archivo ? null : capturaGuardada,
      });
      onCargada(r.busqueda, r.cotizacion);
      setMonto("");
      setNota("");
      setArchivo(null);
    } catch (err: unknown) {
      setError(`No se pudo registrar el precio: ${describirError(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  const campo = "rounded-md border border-slate-300 px-2 py-1 text-sm";

  return (
    <form onSubmit={(e) => void enviar(e)} aria-label="Carga manual" className="grid gap-3 rounded-md border border-slate-200 p-3">
      <p className="text-sm text-slate-700">
        Precio leído a mano en el sitio oficial de <span className="font-medium">{busqueda.aerolineaIata}</span>. Se guarda con URL, captura, monto y hora; se convierte a USD con la tasa del momento.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Fecha
          <select value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo}>
            {combos.map((c) => (
              <option key={claveFecha(c)} value={claveFecha(c)}>
                {c.fechaVuelta === null ? fechaCorta(c.fechaIda) : `${fechaCorta(c.fechaIda)} → ${fechaCorta(c.fechaVuelta)}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Monto publicado
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="780" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Moneda
          <input value={moneda} maxLength={3} onChange={(e) => setMoneda(e.target.value.toUpperCase())} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-2">
          URL de la página con el precio
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Hora en que viste el precio
          <input type="datetime-local" value={capturadoEn} max={ahoraLocal()} onChange={(e) => setCapturadoEn(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-2">
          Nota (itinerario, escalas, tarifa)
          <input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="1 escala en GRU, 18h35, tarifa Light" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Captura de pantalla (PNG o JPEG)
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-xs" />
        </label>
        {capturas.length > 0 && (
          <label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-2">
            O usar la captura guardada por la lectura asistida
            <select value={capturaGuardada ?? ""} onChange={(e) => setCapturaGuardada(e.target.value === "" ? null : e.target.value)} className={campo}>
              <option value="">— subir una nueva —</option>
              {capturas.map((c) => (
                <option key={c.ruta} value={c.ruta}>
                  {c.ruta} · {fechaHoraCorta(c.capturadoEn)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={enviando} className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {enviando ? "Registrando…" : "Registrar precio leído"}
        </button>
      </div>
    </form>
  );
};
