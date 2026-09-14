const RADIO_TIERRA_KM = 6371.0088;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

// Distancia ortodrómica (haversine) en kilómetros.
export const distanciaKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const dLat = aRadianes(b.lat - a.lat);
  const dLon = aRadianes(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
};
