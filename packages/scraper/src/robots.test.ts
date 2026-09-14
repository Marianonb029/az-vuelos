import { describe, expect, it } from "vitest";
import { evaluarRobots } from "./robots";

const AR = `User-agent: *
Disallow: /booking
Disallow: /flights-offers
Disallow: /*/flights-offers
Sitemap: https://www.aerolineas.com.ar/sitemap_index.xml`;

const JETSMART = `User-agent: *
Disallow: https://booking.jetsmart.com/
Allow: /`;

describe("evaluarRobots", () => {
  it("detecta Disallow por prefijo y lo informa", () => {
    const v = evaluarRobots(AR, "https://www.aerolineas.com.ar/flights-offers?adt=1&leg=ASU-MAD-20261120");
    expect(v.permitido).toBe(false);
    expect(v.regla).toBe("Disallow: /flights-offers");
  });

  it("permite rutas no listadas", () => {
    expect(evaluarRobots(AR, "https://www.aerolineas.com.ar/").permitido).toBe(true);
  });

  it("ignora reglas de otro host y respeta Allow", () => {
    expect(evaluarRobots(JETSMART, "https://jetsmart.com/ar/es/").permitido).toBe(true);
    const v = evaluarRobots("User-agent: *\nDisallow: /", "https://booking.jetsmart.com/V2/Flight");
    expect(v.permitido).toBe(false);
    expect(v.regla).toBe("Disallow: /");
  });

  it("comodines y anclas", () => {
    const txt = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /web/*.do";
    expect(evaluarRobots(txt, "https://x.com/a/b.pdf").permitido).toBe(false);
    expect(evaluarRobots(txt, "https://x.com/a/b.pdfx").permitido).toBe(true);
    expect(evaluarRobots(txt, "https://x.com/web/search.do?q=1").permitido).toBe(false);
  });

  it("sólo aplica el grupo User-agent: *", () => {
    const txt = "User-agent: Googlebot\nDisallow: /privado\n\nUser-agent: *\nAllow: /";
    expect(evaluarRobots(txt, "https://x.com/privado").permitido).toBe(true);
  });
});
