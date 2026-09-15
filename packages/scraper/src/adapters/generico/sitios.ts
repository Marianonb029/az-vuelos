// Sitios oficiales para el adaptador asistido genérico. `busqueda` admite un deep link con marcadores
// ({origen} {destino} {fechaIda} {fechaVuelta}) cuando se sondeó uno estable; hasta entonces, la
// portada y la persona hace la búsqueda. Un deep link equivocado no rompe nada: la persona navega igual.
export interface SitioAerolinea {
  iata: string;
  nombre: string;
  dominio: string;
  busqueda: string | null;
}

export const SITIOS: readonly SitioAerolinea[] = [
  // América del Norte
  { iata: "AA", nombre: "American Airlines", dominio: "www.aa.com", busqueda: null },
  { iata: "DL", nombre: "Delta Air Lines", dominio: "www.delta.com", busqueda: null },
  { iata: "UA", nombre: "United Airlines", dominio: "www.united.com", busqueda: null },
  { iata: "WN", nombre: "Southwest Airlines", dominio: "www.southwest.com", busqueda: null },
  { iata: "AC", nombre: "Air Canada", dominio: "www.aircanada.com", busqueda: null },
  { iata: "AM", nombre: "Aeroméxico", dominio: "aeromexico.com", busqueda: null },
  // América Central
  { iata: "CM", nombre: "Copa Airlines", dominio: "www.copaair.com", busqueda: null },
  { iata: "Y4", nombre: "Volaris", dominio: "cms.volaris.com", busqueda: null },
  { iata: "5U", nombre: "TAG Airlines", dominio: "www.tag.com.gt", busqueda: null },
  // América del Sur
  { iata: "LA", nombre: "LATAM Airlines", dominio: "www.latamairlines.com", busqueda: null }, // el deep link /py/es/oferta-vuelos respondió 404 al sondearlo
  // Deep link real del buscador (sondeado el 15/09/2026); booking.avianca.com responde 403 de Imperva a sesiones automatizadas.
  { iata: "AV", nombre: "Avianca", dominio: "www.avianca.com", busqueda: "https://booking.avianca.com/av/booking/avail?departureDate={fechaIda}&tripType=one-way&platform=WEBB2C&from={origen}&to={destino}&nbAdults=1&nbYoungs=0&nbChildren=0&nbInfants=0&language=ES&pointOfSale=CO" },
  // Deep link real (sondeado el 15/09/2026); su API bff-flight.voegol.com.br responde 406 a sesiones automatizadas, incluso llenando el formulario.
  { iata: "G3", nombre: "GOL Linhas Aéreas", dominio: "www.voegol.com.br", busqueda: "https://b2c.voegol.com.br/compra/busca-parceiros?tipo=DF&de={origen}&para={destino}&ida={fechaIdaDMY}&ADT=1&CHD=0&INF=0&pv=&ac=&cc=&pais=BR&lang=pt" },
  { iata: "H2", nombre: "Sky Airline", dominio: "www.skyairline.com", busqueda: null },
  // Europa
  { iata: "LH", nombre: "Lufthansa", dominio: "www.lufthansa.com", busqueda: null },
  { iata: "FR", nombre: "Ryanair", dominio: "www.ryanair.com", busqueda: null },
  { iata: "BA", nombre: "British Airways", dominio: "www.britishairways.com", busqueda: null },
  { iata: "AF", nombre: "Air France", dominio: "wwws.airfrance.com", busqueda: null },
  { iata: "KL", nombre: "KLM", dominio: "www.klm.com", busqueda: null },
  { iata: "U2", nombre: "easyJet", dominio: "www.easyjet.com", busqueda: null },
  { iata: "AY", nombre: "Finnair", dominio: "www.finnair.com", busqueda: null },
  // Medio Oriente y Asia
  { iata: "TK", nombre: "Turkish Airlines", dominio: "www.turkishairlines.com", busqueda: null },
  { iata: "EK", nombre: "Emirates", dominio: "www.emirates.com", busqueda: null },
  { iata: "QR", nombre: "Qatar Airways", dominio: "www.qatarairways.com", busqueda: null },
  { iata: "EY", nombre: "Etihad Airways", dominio: "www.etihad.com", busqueda: null },
  { iata: "SQ", nombre: "Singapore Airlines", dominio: "www.singaporeair.com", busqueda: null },
  { iata: "CX", nombre: "Cathay Pacific", dominio: "www.cathaypacific.com", busqueda: null },
  { iata: "JL", nombre: "Japan Airlines", dominio: "www.jal.co.jp", busqueda: null },
  { iata: "KE", nombre: "Korean Air", dominio: "www.koreanair.com", busqueda: null },
  { iata: "CA", nombre: "Air China", dominio: "www.airchina.com", busqueda: null },
  { iata: "MU", nombre: "China Eastern Airlines", dominio: "www.ceair.com", busqueda: null },
  { iata: "CZ", nombre: "China Southern Airlines", dominio: "www.csair.com", busqueda: null },
  { iata: "MH", nombre: "Malaysia Airlines", dominio: "www.malaysiaairlines.com", busqueda: null },
  { iata: "GA", nombre: "Garuda Indonesia", dominio: "www.garuda-indonesia.com", busqueda: null },
  { iata: "PR", nombre: "Philippine Airlines", dominio: "www.philippineairlines.com", busqueda: null },
  { iata: "VN", nombre: "Vietnam Airlines", dominio: "www.vietnamairlines.com", busqueda: null },
  { iata: "TR", nombre: "Scoot", dominio: "www.flyscoot.com", busqueda: null },
  // Oceanía
  { iata: "QF", nombre: "Qantas", dominio: "www.qantas.com", busqueda: null },
  { iata: "NZ", nombre: "Air New Zealand", dominio: "www.airnewzealand.com", busqueda: null },
  { iata: "JQ", nombre: "Jetstar", dominio: "www.jetstar.com", busqueda: null },
];
