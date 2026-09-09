import { Quaternion, Vector3 } from "three";
import { ADVANCE_RATE } from "../astronomy/SimulationClock";

const MAX_SPIN = Math.PI * 0.32;

export class SurfaceRotation {
  readonly orientation = new Quaternion();
  private initialized = false;
  private advancing = false;
  private previousTime = 0;
  private restoreStarted: number | null = null;
  private readonly restoreFrom = new Quaternion();
  private readonly oldNorth = new Vector3();
  private readonly north = new Vector3();
  private readonly rotation = new Quaternion();

  constructor(private readonly rotationDays: number) {}

  update(actual: Quaternion, advancing: boolean, now: number): Quaternion {
    if (!this.initialized) {
      this.orientation.copy(actual);
      this.previousTime = now;
      this.initialized = true;
    }
    const delta = Math.max(0, Math.min((now - this.previousTime) / 1000, 0.1));
    this.previousTime = now;
    if (advancing) {
      this.restoreStarted = null;
      this.oldNorth.set(0, 1, 0).applyQuaternion(this.orientation);
      this.north.set(0, 1, 0).applyQuaternion(actual);
      this.rotation.setFromUnitVectors(this.oldNorth, this.north);
      this.orientation.premultiply(this.rotation);
      const speed = (ADVANCE_RATE * Math.PI * 2) / (this.rotationDays * 86400);
      const angle =
        Math.sign(speed) * Math.min(Math.abs(speed), MAX_SPIN) * delta;
      this.rotation.setFromAxisAngle(this.north, angle);
      this.orientation.premultiply(this.rotation).normalize();
    } else {
      if (this.advancing) {
        this.restoreStarted = now;
        this.restoreFrom.copy(this.orientation);
      }
      if (this.restoreStarted !== null) {
        const t = Math.min((now - this.restoreStarted) / 700, 1);
        this.orientation.slerpQuaternions(
          this.restoreFrom,
          actual,
          t * t * (3 - 2 * t),
        );
        if (t === 1) this.restoreStarted = null;
      } else this.orientation.copy(actual);
    }
    this.advancing = advancing;
    return this.orientation;
  }
}
