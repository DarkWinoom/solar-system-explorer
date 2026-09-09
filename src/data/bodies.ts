import { Body } from "astronomy-engine";

export type BodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "moon";
export type ViewId = BodyId | "overview";
export interface BodyDefinition {
  id: BodyId;
  body: Body;
  order: string;
  category: "star" | "terrestrial" | "gasGiant" | "iceGiant" | "satellite";
  color: string;
  radius: number;
  orbitRadius: number;
  semimajorAU: number;
  diameterKm: number;
  orbitalDays: number | null;
  rotationDays: number;
  texture: string;
  source: string;
}

const planetarySource = "https://ssd.jpl.nasa.gov/planets/phys_par.html";
const year = 365.25;
export const BODIES: readonly BodyDefinition[] = [
  {
    id: "sun",
    body: Body.Sun,
    order: "00",
    category: "star",
    color: "#e9bf7a",
    radius: 6,
    orbitRadius: 0,
    semimajorAU: 0,
    diameterKm: 1400000,
    orbitalDays: null,
    rotationDays: 25,
    texture: "2k_sun.webp",
    source: "https://science.nasa.gov/sun/facts/",
  },
  {
    id: "mercury",
    body: Body.Mercury,
    order: "01",
    category: "terrestrial",
    color: "#b3afa6",
    radius: 0.75,
    orbitRadius: 12,
    semimajorAU: 0.38709927,
    diameterKm: 4878.8,
    orbitalDays: 0.2408467 * year,
    rotationDays: 58.6462,
    texture: "2k_mercury.webp",
    source: planetarySource,
  },
  {
    id: "venus",
    body: Body.Venus,
    order: "02",
    category: "terrestrial",
    color: "#d9bc8e",
    radius: 1.25,
    orbitRadius: 19,
    semimajorAU: 0.72333566,
    diameterKm: 12103.6,
    orbitalDays: 0.61519726 * year,
    rotationDays: -243.018,
    texture: "2k_venus_atmosphere.webp",
    source: planetarySource,
  },
  {
    id: "earth",
    body: Body.Earth,
    order: "03",
    category: "terrestrial",
    color: "#80c4df",
    radius: 1.35,
    orbitRadius: 27,
    semimajorAU: 1.00000261,
    diameterKm: 12742.0168,
    orbitalDays: 1.0000174 * year,
    rotationDays: 0.99726968,
    texture: "2k_earth_daymap.webp",
    source: planetarySource,
  },
  {
    id: "mars",
    body: Body.Mars,
    order: "04",
    category: "terrestrial",
    color: "#cd8d6b",
    radius: 1,
    orbitRadius: 37,
    semimajorAU: 1.52371034,
    diameterKm: 6779,
    orbitalDays: 1.8808476 * year,
    rotationDays: 1.02595676,
    texture: "2k_mars.webp",
    source: planetarySource,
  },
  {
    id: "jupiter",
    body: Body.Jupiter,
    order: "05",
    category: "gasGiant",
    color: "#cfb49a",
    radius: 3.5,
    orbitRadius: 54,
    semimajorAU: 5.202887,
    diameterKm: 139822,
    orbitalDays: 11.862615 * year,
    rotationDays: 0.41354,
    texture: "2k_jupiter.webp",
    source: planetarySource,
  },
  {
    id: "saturn",
    body: Body.Saturn,
    order: "06",
    category: "gasGiant",
    color: "#d7c29b",
    radius: 3,
    orbitRadius: 73,
    semimajorAU: 9.53667594,
    diameterKm: 116464,
    orbitalDays: 29.447498 * year,
    rotationDays: 0.44401,
    texture: "2k_saturn.webp",
    source: planetarySource,
  },
  {
    id: "uranus",
    body: Body.Uranus,
    order: "07",
    category: "iceGiant",
    color: "#a3d2d4",
    radius: 2.3,
    orbitRadius: 94,
    semimajorAU: 19.18916464,
    diameterKm: 50724,
    orbitalDays: 84.016846 * year,
    rotationDays: -0.71833,
    texture: "2k_uranus.webp",
    source: planetarySource,
  },
  {
    id: "neptune",
    body: Body.Neptune,
    order: "08",
    category: "iceGiant",
    color: "#85addd",
    radius: 2.2,
    orbitRadius: 116,
    semimajorAU: 30.06992276,
    diameterKm: 49244,
    orbitalDays: 164.79132 * year,
    rotationDays: 0.67125,
    texture: "2k_neptune.webp",
    source: planetarySource,
  },
  {
    id: "moon",
    body: Body.Moon,
    order: "M",
    category: "satellite",
    color: "#c2c7ce",
    radius: 0.37,
    orbitRadius: 3.4,
    semimajorAU: 0.00256956,
    diameterKm: 3474.8,
    orbitalDays: 27.321661,
    rotationDays: 27.321661,
    texture: "2k_moon.webp",
    source: "https://science.nasa.gov/moon/facts/",
  },
];
export const BODY_BY_ID = Object.fromEntries(
  BODIES.map((body) => [body.id, body]),
) as Record<BodyId, BodyDefinition>;
export const PLANETS = BODIES.filter(
  (body) => body.category !== "star" && body.category !== "satellite",
);
export function isBodyId(value: string): value is BodyId {
  return Object.hasOwn(BODY_BY_ID, value);
}
