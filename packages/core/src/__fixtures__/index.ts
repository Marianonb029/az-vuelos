import type {
  Busqueda,
  CotizacionNoVerificada,
  CotizacionVerificada,
  Lectura,
  Tramo,
} from "../schema";

export const tramoIda: Tramo = {
  direccion: "ida",
  fecha: "2027-01-01",
  salidaLocal: "23:55",
  llegadaLocal: "16:30",
  desfaseDias: 1,
  duracionMin: 995,
  escalas: 1,
  aeropuertosEscala: ["GRU"],
  numerosVuelo: ["IB6841", "IB3120"],
};

export const tramoVuelta: Tramo = {
  direccion: "vuelta",
  fecha: "2027-01-15",
  salidaLocal: "10:20",
  llegadaLocal: "18:05",
  desfaseDias: 0,
  duracionMin: 825,
  escalas: 0,
  aeropuertosEscala: [],
  numerosVuelo: ["IB6845"],
};

export const busquedaIdaYVuelta: Busqueda = {
  id: "0d8b3d3e-2f6a-4d0c-9c5a-1f2e3a4b5c6d",
  tipo: "ida_y_vuelta",
  aerolineaIata: "IB",
  origenIata: "ASU",
  destinoIata: "MAD",
  equipaje: "carry_on",
  rangoIda: { desde: "2027-01-01", hasta: "2027-01-03" },
  rangoVuelta: { desde: "2027-01-15", hasta: "2027-01-15" },
  creadaEn: "2026-09-14T10:00:00.000Z",
  estado: "pendiente",
  motivoFallo: null,
};

export const busquedaIda: Busqueda = {
  ...busquedaIdaYVuelta,
  id: "1e9c4e4f-3a7b-4e1d-8d6b-2a3f4b5c6d7e",
  tipo: "ida",
  rangoVuelta: null,
};

export const lecturaEur: Lectura = {
  tipo: "ida_y_vuelta",
  tramos: [tramoIda, tramoVuelta],
  montoOriginal: 779.35,
  monedaOriginal: "EUR",
  equipaje: {
    itemPersonal: true,
    carryOn: true,
    piezasBodega: 0,
    textoOriginal: "1 bolso o mochila pequeña + 1 equipaje de mano",
  },
  evidencia: {
    url: "https://www.iberia.com/es/vuelos/ASU-MAD/2027-01-01/2027-01-15",
    capturadoEn: "2026-09-14T10:05:12.000Z",
    screenshotPath: "evidencia/0d8b3d3e/abc123.png",
    selector: "[data-test='fare-price']",
    textoCrudo: "779,35 €",
  },
};

export const cotizacionVerificada: CotizacionVerificada = {
  id: "2fa0d5a0-4b8c-4f2e-9e7c-3b4a5c6d7e8f",
  busquedaId: busquedaIdaYVuelta.id,
  aerolinea: { iata: "IB", nombre: "Iberia" },
  tipo: "ida_y_vuelta",
  origenIata: "ASU",
  destinoIata: "MAD",
  fechaIda: "2027-01-01",
  fechaVuelta: "2027-01-15",
  estado: "verificado",
  tramos: [tramoIda, tramoVuelta],
  precio: {
    montoOriginal: 779.35,
    monedaOriginal: "EUR",
    montoUsd: 841.23,
    fx: {
      par: "EUR/USD",
      tasa: 1.0794,
      fuente: "ExchangeRate-API",
      capturadaEn: "2026-09-14T00:00:01.000Z",
    },
  },
  equipaje: lecturaEur.equipaje,
  evidencia: lecturaEur.evidencia,
};

export const cotizacionUsdIda: CotizacionVerificada = {
  ...cotizacionVerificada,
  id: "3ab1e6b1-5c9d-4a3f-8f8d-4c5b6d7e8f90",
  busquedaId: busquedaIda.id,
  tipo: "ida",
  fechaVuelta: null,
  tramos: [tramoIda],
  precio: { montoOriginal: 412, monedaOriginal: "USD", montoUsd: 412, fx: null },
};

export const cotizacionErrorLectura: CotizacionNoVerificada = {
  id: "4bc2f7c2-6dae-4b40-9a9e-5d6c7e8f9a01",
  busquedaId: busquedaIdaYVuelta.id,
  aerolinea: { iata: "IB", nombre: "Iberia" },
  tipo: "ida_y_vuelta",
  origenIata: "ASU",
  destinoIata: "MAD",
  fechaIda: "2027-01-02",
  fechaVuelta: "2027-01-15",
  estado: "error_lectura",
  motivo: "No se encontró el selector del precio",
  evidencia: {
    url: "https://www.iberia.com/es/vuelos/ASU-MAD/2027-01-02/2027-01-15",
    capturadoEn: "2026-09-14T10:07:40.000Z",
    screenshotPath: "evidencia/0d8b3d3e/def456.png",
  },
};
