import { describe, expect, it } from "bun:test";

import { describeWeatherCode } from "@/lib/weather-code";

/** The WMO table is our only source of weather text — Open-Meteo returns codes,
 *  no words — so a representative spread plus the unknown-code fallback are
 *  worth pinning. */
describe("describeWeatherCode", () => {
  it("maps representative codes to a label and icon group", () => {
    expect(describeWeatherCode(0)).toEqual({ label: "Clear sky", group: "clear" });
    expect(describeWeatherCode(2)).toEqual({
      label: "Partly cloudy",
      group: "partly-cloudy",
    });
    expect(describeWeatherCode(3)).toEqual({ label: "Overcast", group: "cloudy" });
    expect(describeWeatherCode(45).group).toBe("fog");
    expect(describeWeatherCode(63)).toEqual({ label: "Rain", group: "rain" });
    expect(describeWeatherCode(75).group).toBe("snow");
    expect(describeWeatherCode(95).group).toBe("thunderstorm");
  });

  it("degrades an unrecognised code to a neutral dash rather than throwing", () => {
    expect(describeWeatherCode(1234)).toEqual({ label: "—", group: "unknown" });
    expect(describeWeatherCode(-1).group).toBe("unknown");
  });
});
