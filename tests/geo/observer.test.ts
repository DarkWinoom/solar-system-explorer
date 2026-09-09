import { describe, expect, it } from "vitest";
import { observerContext, sunTimes } from "../../src/geo/observer";

describe("observer context", () => {
  it("uses the time zone representative without a geolocation request", () => {
    expect(
      observerContext(new URLSearchParams("tz=Asia/Shanghai")),
    ).toMatchObject({
      lat: 31.2,
      lon: 121.5,
      timeZone: "Asia/Shanghai",
      approximate: true,
    });
  });
  it("accepts valid manual coordinates and ignores invalid ones", () => {
    expect(
      observerContext(
        new URLSearchParams("loc=-33.9,151.2&tz=Australia/Sydney"),
      ),
    ).toMatchObject({ lat: -33.9, lon: 151.2, approximate: false });
    expect(
      observerContext(new URLSearchParams("loc=91,999&tz=Asia/Shanghai")),
    ).toMatchObject({ approximate: true, lat: 31.2 });
    expect(
      observerContext(new URLSearchParams("loc=,&tz=Asia/Shanghai")),
    ).toMatchObject({ approximate: true });
  });
  it("handles invalid time zones without preventing startup", () =>
    expect(() =>
      observerContext(new URLSearchParams("tz=Invalid/Zone")),
    ).not.toThrow());
  it("returns no sunrise or sunset during polar day", () => {
    expect(
      sunTimes(new Date("2026-06-21T12:00:00Z"), {
        lat: 89,
        lon: 0,
        timeZone: "UTC",
        approximate: false,
      }),
    ).toEqual({ sunrise: null, sunset: null });
  });
  it("keeps daylight events within the observer’s local date, including DST days", () => {
    for (const date of ["2026-03-08T12:00:00Z", "2026-11-01T12:00:00Z"]) {
      const observer = {
        lat: 40.7,
        lon: -74,
        timeZone: "America/New_York",
        approximate: false,
      };
      const events = sunTimes(new Date(date), observer);
      expect(events.sunrise).not.toBeNull();
      expect(events.sunset).not.toBeNull();
      expect(events.sunrise!.getTime()).toBeLessThan(events.sunset!.getTime());
      const format = new Intl.DateTimeFormat("en", {
        timeZone: observer.timeZone,
        day: "numeric",
      });
      expect(format.format(events.sunrise!)).toBe(
        format.format(new Date(date)),
      );
    }
  });
});
