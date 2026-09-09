import { Body, Observer, SearchRiseSet } from "astronomy-engine";
import { timezoneToCoord } from "./timezoneMap";
import { tzOffsetHours } from "./timezone";

export interface ObserverContext {
  lat: number;
  lon: number;
  timeZone: string;
  approximate: boolean;
}

export function observerContext(
  params = new URLSearchParams(location.search),
): ObserverContext {
  let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const override = params.get("tz");
  if (override) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: override }).format();
      timeZone = override;
    } catch {
      /* Keep the system time zone. */
    }
  }
  const raw = params.get("loc")?.split(",");
  if (raw && raw.length >= 2 && raw[0].trim() && raw[1].trim()) {
    const lat = Number(raw[0]),
      lon = Number(raw[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    )
      return { lat, lon, timeZone, approximate: false };
  }
  const point = timezoneToCoord(timeZone) ?? {
    lat: 0,
    lon: Math.max(-180, Math.min(180, tzOffsetHours(timeZone) * 15)),
  };
  return { ...point, timeZone, approximate: true };
}

export function sunTimes(
  date: Date,
  context: ObserverContext,
): { sunrise: Date | null; sunset: Date | null } {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: context.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = format.formatToParts(date);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)!.value);
  const localDate = Date.UTC(part("year"), part("month") - 1, part("day"));
  let start = new Date(localDate);
  for (let i = 0; i < 3; i++)
    start = new Date(
      localDate - tzOffsetHours(context.timeZone, start) * 3600_000,
    );
  const observer = new Observer(context.lat, context.lon, 0);
  const find = (direction: 1 | -1) => {
    const event = SearchRiseSet(
      Body.Sun,
      observer,
      direction,
      start,
      1.1,
    )?.date;
    return event && format.format(event) === format.format(date) ? event : null;
  };
  return { sunrise: find(1), sunset: find(-1) };
}
