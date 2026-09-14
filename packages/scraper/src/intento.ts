export const TIMEOUT_INTENTO_MS = 90_000;
export const ESPERAS_REINTENTO_MS = [5_000, 15_000];

// Error que no debe reintentarse: el sitio respondió con un rechazo explícito.
export class ErrorBloqueo extends Error {
  constructor(
    message: string,
    public readonly url: string | null,
  ) {
    super(message);
    this.name = "ErrorBloqueo";
  }
}

// Error de lectura del DOM: la página cargó pero no se pudo extraer lo esperado. No se reintenta.
export class ErrorLectura extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorLectura";
  }
}

export class ErrorTimeout extends Error {
  constructor(ms: number) {
    super(`El intento superó los ${ms / 1000} s`);
    this.name = "ErrorTimeout";
  }
}

const conTimeout = <T>(promesa: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new ErrorTimeout(ms)), ms);
    promesa.then(
      (v) => {
        clearTimeout(temporizador);
        resolver(v);
      },
      (e: unknown) => {
        clearTimeout(temporizador);
        rechazar(e);
      },
    );
  });

const esTransitorio = (e: unknown): boolean =>
  e instanceof ErrorTimeout || (e instanceof Error && /net::|ECONN|ETIMEDOUT|Timeout|timeout|Navigation/.test(e.message));

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RegistroIntento {
  intento: number;
  error: Error;
}

// Ejecuta `accion` con timeout duro y hasta 2 reintentos con backoff, sólo ante errores transitorios.
export const conReintentos = async <T>(
  accion: () => Promise<T>,
  alFallar: (registro: RegistroIntento) => Promise<void>,
  esperas: readonly number[] = ESPERAS_REINTENTO_MS,
  timeoutMs = TIMEOUT_INTENTO_MS,
): Promise<T> => {
  for (let intento = 1; ; intento++) {
    try {
      return await conTimeout(accion(), timeoutMs);
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      await alFallar({ intento, error });
      const espera = esperas[intento - 1];
      if (espera === undefined || !esTransitorio(error)) throw error;
      await dormir(espera);
    }
  }
};
