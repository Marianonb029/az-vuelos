import { describe, expect, it, vi } from "vitest";
import { ErrorBloqueo, ErrorLectura, ErrorTimeout, conReintentos } from "./intento";

const sinEspera = [0, 0];

describe("conReintentos", () => {
  it("devuelve el resultado del primer intento exitoso", async () => {
    const alFallar = vi.fn(async () => {});
    const r = await conReintentos(async () => 42, alFallar, sinEspera, 1000);
    expect(r).toBe(42);
    expect(alFallar).not.toHaveBeenCalled();
  });

  it("reintenta ante timeout y errores de red, máximo 2 veces", async () => {
    let llamadas = 0;
    const alFallar = vi.fn(async () => {});
    const accion = async () => {
      llamadas++;
      if (llamadas < 3) throw new Error("net::ERR_CONNECTION_RESET");
      return "ok";
    };
    expect(await conReintentos(accion, alFallar, sinEspera, 1000)).toBe("ok");
    expect(llamadas).toBe(3);
    expect(alFallar).toHaveBeenCalledTimes(2);
  });

  it("agota los reintentos y propaga el último error", async () => {
    const alFallar = vi.fn(async () => {});
    const accion = async () => {
      throw new Error("Timeout 30000ms exceeded");
    };
    await expect(conReintentos(accion, alFallar, sinEspera, 1000)).rejects.toThrow("Timeout");
    expect(alFallar).toHaveBeenCalledTimes(3);
  });

  it("no reintenta ante bloqueo ni error de lectura", async () => {
    const alFallar = vi.fn(async () => {});
    let llamadas = 0;
    const bloqueo = async () => {
      llamadas++;
      throw new ErrorBloqueo("HTTP 403", "https://x.com");
    };
    await expect(conReintentos(bloqueo, alFallar, sinEspera, 1000)).rejects.toBeInstanceOf(ErrorBloqueo);
    const lectura = async () => {
      llamadas++;
      throw new ErrorLectura("sin selector");
    };
    await expect(conReintentos(lectura, alFallar, sinEspera, 1000)).rejects.toBeInstanceOf(ErrorLectura);
    expect(llamadas).toBe(2);
  });

  it("aplica el timeout duro", async () => {
    const alFallar = vi.fn(async () => {});
    const lenta = () => new Promise<string>((r) => setTimeout(() => r("tarde"), 200));
    await expect(conReintentos(lenta, alFallar, [], 20)).rejects.toBeInstanceOf(ErrorTimeout);
  });
});
