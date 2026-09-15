import { z } from "zod";
import { Aeropuerto } from "@az/core";
import aeropuertosJson from "../../../../data/airports.json";

export const aeropuertos: readonly Aeropuerto[] = z.array(Aeropuerto).parse(aeropuertosJson);
