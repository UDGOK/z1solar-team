/**
 * Geocoding + incentive reference helpers.
 *
 * Geocoding uses OpenStreetMap's Nominatim — free, no API key. Their usage
 * policy requires a identifying User-Agent and max ~1 request/second, which
 * is fine for occasional manual lookups when saving a project.
 */

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address?.trim()) return null;
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=" +
    encodeURIComponent(address.trim());
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Z1PowerTeamHub/1.0 (internal project tool)" },
      // Don't let a slow third party hang the save action.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const hit = data[0];
    const a = hit.address || {};
    return {
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      displayName: hit.display_name,
      city: a.city || a.town || a.village || a.hamlet || undefined,
      state: US_STATE_ABBR[a.state] || a.state || undefined,
      postalCode: a.postcode || undefined,
    };
  } catch {
    return null;
  }
}

const US_STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

/**
 * Federal incentives that are statutory — these are law, not estimates, so
 * pre-filling them is safe. Everything state/utility-specific is deliberately
 * NOT auto-filled: there is no free, reliable, machine-readable source for it,
 * and a wrong incentive figure on a client quote is far worse than a blank one.
 */
export type SuggestedRebate = {
  name: string;
  authority: string;
  category: string;
  incentiveType: string;
  value: number;
  notes: string;
  sourceUrl: string;
};

export const FEDERAL_INCENTIVES: SuggestedRebate[] = [
  {
    name: "Federal Investment Tax Credit (ITC) — Solar",
    authority: "Federal",
    category: "Solar",
    incentiveType: "Percentage",
    value: 30,
    notes:
      "Base rate under the Inflation Reduction Act. Bonus adders may apply (domestic content, energy community, low-income). Confirm current-year rate and prevailing-wage/apprenticeship requirements with your tax advisor.",
    sourceUrl: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses",
  },
  {
    name: "Federal ITC — Standalone Energy Storage (BESS)",
    authority: "Federal",
    category: "BESS",
    incentiveType: "Percentage",
    value: 30,
    notes:
      "Standalone storage ≥5 kWh became ITC-eligible under the IRA. Confirm sizing rules and current-year rate with your tax advisor.",
    sourceUrl: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses",
  },
  {
    name: "MACRS Accelerated Depreciation",
    authority: "Federal",
    category: "Other",
    incentiveType: "Percentage",
    value: 0,
    notes:
      "5-year MACRS schedule generally applies to qualifying solar/storage property. Value depends entirely on tax position — model with your accountant.",
    sourceUrl: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses",
  },
];

/** Research links, pre-filtered to the project's state where possible. */
export function rebateResearchLinks(state?: string | null) {
  const st = (state || "").toUpperCase();
  return [
    {
      label: st ? `DSIRE — all ${st} incentives` : "DSIRE — incentives by state",
      url: st ? `https://programs.dsireusa.org/system/program?state=${st}` : "https://www.dsireusa.org/",
      note: "The authoritative US incentive database (NC State). Filter by technology and sector.",
    },
    {
      label: "DSIRE — Federal programs",
      url: "https://programs.dsireusa.org/system/program?type=37&technology=7",
      note: "Federal-level solar and storage programs.",
    },
    {
      label: "DOE — Solar tax credits for businesses",
      url: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses",
      note: "Official guidance on ITC rates, adders, and eligibility.",
    },
    {
      label: "EnergySage — commercial incentives",
      url: "https://www.energysage.com/solar/solar-incentives-by-state/",
      note: "Plain-language state-by-state summaries. Verify against DSIRE before quoting.",
    },
  ];
}
