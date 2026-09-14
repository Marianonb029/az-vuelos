import { z } from "zod";
import { Aerolinea, Aeropuerto } from "@az/core";
import aerolineasJson from "../../../../data/airlines.json";
import aeropuertosJson from "../../../../data/airports.json";

export const aerolineas: readonly Aerolinea[] = z.array(Aerolinea).parse(aerolineasJson);
export const aeropuertos: readonly Aeropuerto[] = z.array(Aeropuerto).parse(aeropuertosJson);

export const aerolineaPorIata = (iata: string) => aerolineas.find((a) => a.iata === iata) ?? null;
export const aeropuertoPorIata = (iata: string) => aeropuertos.find((a) => a.iata === iata) ?? null;
