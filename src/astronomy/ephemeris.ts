import {
  Body,
  GeoMoon,
  HelioVector,
  MakeTime,
  Observer,
  ObserverVector,
  RotateVector,
  RotationAxis,
  Rotation_EQJ_ECL,
  Vector,
  type FlexibleDateTime,
} from "astronomy-engine";
import { Matrix4, Quaternion, Vector3 } from "three";
import { BODIES, BODY_BY_ID, type BodyId } from "../data/bodies";

export const DAY_MS = 86_400_000;
export const AU_KM = 149_597_870.7;
const eclipticRotation = Rotation_EQJ_ECL();
const degrees = Math.PI / 180;

export interface BodyState {
  positionAU: Vector3;
  position: Vector3;
  orientation: Quaternion;
  sunDirection: Vector3;
}
export interface SolarState {
  instant: number;
  bodies: Record<BodyId, BodyState>;
  moonIllumination: number;
}

export function toSceneVector(vector: Vector): Vector3 {
  const ecl = RotateVector(eclipticRotation, vector);
  // J2000 ecliptic XYZ -> right-handed Three.js X, Z, -Y.
  return new Vector3(ecl.x, ecl.z, -ecl.y);
}

export function bodyPositionAU(id: BodyId, date: FlexibleDateTime): Vector3 {
  return toSceneVector(HelioVector(BODY_BY_ID[id].body, date));
}

export function displayPosition(
  id: BodyId,
  positionAU: Vector3,
  earthAU?: Vector3,
): Vector3 {
  const definition = BODY_BY_ID[id];
  if (id === "sun") return new Vector3();
  if (id === "moon") {
    if (!earthAU) throw new Error("Earth position is required for the Moon");
    return positionAU
      .clone()
      .sub(earthAU)
      .multiplyScalar(definition.orbitRadius / definition.semimajorAU)
      .add(displayPosition("earth", earthAU));
  }
  return positionAU
    .clone()
    .multiplyScalar(definition.orbitRadius / definition.semimajorAU);
}

export function bodyOrientation(
  id: BodyId,
  date: FlexibleDateTime,
): Quaternion {
  if (id === "earth") {
    const x = toSceneVector(
      ObserverVector(date, new Observer(0, 0, 0), false),
    ).normalize();
    const north = toSceneVector(
      ObserverVector(date, new Observer(90, 0, 0), false),
    ).normalize();
    const west = new Vector3().crossVectors(x, north).normalize();
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(x, north, west),
    );
  }
  const axis = RotationAxis(BODY_BY_ID[id].body, date);
  const t = MakeTime(date);
  const ra = axis.ra * 15 * degrees;
  const node = toSceneVector(new Vector(-Math.sin(ra), Math.cos(ra), 0, t));
  const north = toSceneVector(axis.north).normalize();
  const meridian = node
    .applyAxisAngle(north, (axis.spin % 360) * degrees)
    .normalize();
  const west = new Vector3().crossVectors(meridian, north).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(meridian, north, west),
  );
}

export function solarState(instant: Date): SolarState {
  if (!Number.isFinite(instant.getTime()))
    throw new RangeError("Invalid simulation time");
  const time = MakeTime(instant);
  const earthAU = bodyPositionAU("earth", time);
  const bodies = {} as Record<BodyId, BodyState>;
  for (const definition of BODIES) {
    const positionAU =
      definition.id === "earth"
        ? earthAU
        : definition.id === "moon"
          ? earthAU.clone().add(toSceneVector(GeoMoon(time)))
          : bodyPositionAU(definition.id, time);
    bodies[definition.id] = {
      positionAU,
      position: displayPosition(definition.id, positionAU, earthAU),
      orientation: bodyOrientation(definition.id, time),
      sunDirection: positionAU.clone().negate().normalize(),
    };
  }
  const moonToEarth = earthAU.clone().sub(bodies.moon.positionAU).normalize();
  const moonIllumination = (1 + moonToEarth.dot(bodies.moon.sunDirection)) / 2;
  return { instant: instant.getTime(), bodies, moonIllumination };
}

export function orbitPoints(
  id: BodyId,
  instant: number,
  segments = 512,
): Vector3[] {
  const definition = BODY_BY_ID[id];
  if (definition.orbitalDays === null) return [];
  const period = definition.orbitalDays * DAY_MS;
  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const date = new Date(instant + (i / segments - 0.5) * period);
    const point =
      id === "moon" ? toSceneVector(GeoMoon(date)) : bodyPositionAU(id, date);
    points.push(
      point.multiplyScalar(definition.orbitRadius / definition.semimajorAU),
    );
  }
  return points;
}

export class RealTimeEphemeris {
  private start: SolarState;
  private end: SolarState;
  readonly state: SolarState;

  constructor(private readonly now: () => number = Date.now) {
    const instant = Math.floor(now() / 1000) * 1000;
    this.start = solarState(new Date(instant));
    this.end = solarState(new Date(instant + 1000));
    this.state = solarState(new Date(now()));
  }

  update(): SolarState {
    const instant = this.now();
    if (instant < this.start.instant || instant >= this.end.instant) {
      const second = Math.floor(instant / 1000) * 1000;
      this.start =
        second === this.end.instant ? this.end : solarState(new Date(second));
      this.end = solarState(new Date(second + 1000));
    }
    const t = (instant - this.start.instant) / 1000;
    this.state.instant = instant;
    this.state.moonIllumination =
      this.start.moonIllumination +
      (this.end.moonIllumination - this.start.moonIllumination) * t;
    for (const { id } of BODIES) {
      const state = this.state.bodies[id],
        a = this.start.bodies[id],
        b = this.end.bodies[id];
      state.positionAU.lerpVectors(a.positionAU, b.positionAU, t);
      state.position.lerpVectors(a.position, b.position, t);
      state.orientation.slerpQuaternions(a.orientation, b.orientation, t);
      state.sunDirection.copy(state.positionAU).negate().normalize();
    }
    return this.state;
  }
}

export { Body };
