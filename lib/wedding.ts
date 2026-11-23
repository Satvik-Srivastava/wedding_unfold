export type WeddingEvent = {
  key: string;
  name: string;
  tagline: string;
  start: string;
  end: string;
  venue: string;
  address: string;
  dress: string;
};

export type WeddingConfig = {
  couple: [string, string];
  parents: {
    brideFather: string;
    brideMother: string;
    groomFather: string;
    groomMother: string;
  };
  portraits: {
    bride: string;
    groom: string;
  };
  initials: string;
  city: string;
  hosts: string;
  rsvpBy: string;
  events: WeddingEvent[];
};

const EVENT_DEFAULTS: WeddingEvent[] = [
  { key: "haldi", name: "haldi", tagline: "a little sunshine, a lot of love", start: "", end: "", venue: "", address: "", dress: "" },
  { key: "wedding", name: "the wedding", tagline: "seven steps, one forever", start: "", end: "", venue: "", address: "", dress: "" },
  { key: "reception", name: "reception", tagline: "an evening together", start: "", end: "", venue: "", address: "", dress: "" },
  { key: "party", name: "the celebration", tagline: "music, dancing and joy", start: "", end: "", venue: "", address: "", dress: "" },
];

export function createDefaultWedding(): WeddingConfig {
  return {
    couple: ["", ""],
    parents: { brideFather: "", brideMother: "", groomFather: "", groomMother: "" },
    portraits: { bride: "", groom: "" },
    initials: "unfold",
    city: "",
    hosts: "together with their families",
    rsvpBy: "",
    events: EVENT_DEFAULTS.map((event) => ({ ...event })),
  };
}

export const WEDDING: WeddingConfig = createDefaultWedding();

function initialsFor(couple: [string, string]) {
  const first = couple[0].trim().charAt(0);
  const second = couple[1].trim().charAt(0);
  return [first, second].filter(Boolean).join(" & ") || "unfold";
}

export function applyWedding(config: WeddingConfig) {
  const next = structuredClone(config);
  next.initials = initialsFor(next.couple);
  Object.assign(WEDDING, next);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`Saved wedding settings have an invalid ${field}.`);
  return value;
}

export function parseWeddingSettings(value: unknown): WeddingConfig {
  if (!isRecord(value) || !Array.isArray(value.couple) || !isRecord(value.parents) || !isRecord(value.portraits) || !Array.isArray(value.events)) {
    throw new Error("Saved wedding settings are incomplete. Open the admin page and save them again.");
  }

  const defaults = createDefaultWedding();
  const byKey = new Map(value.events.filter(isRecord).map((event) => [event.key, event]));
  const events = defaults.events.map((fallback) => {
    const saved = byKey.get(fallback.key);
    if (!saved) throw new Error("Saved wedding settings are missing an event. Open the admin page and save them again.");
    return {
      key: fallback.key,
      name: text(saved.name, `${fallback.key} event name`),
      tagline: text(saved.tagline, `${fallback.key} event description`),
      start: text(saved.start, `${fallback.key} start time`),
      end: text(saved.end, `${fallback.key} end time`),
      venue: text(saved.venue, `${fallback.key} venue`),
      address: text(saved.address, `${fallback.key} address`),
      dress: text(saved.dress, `${fallback.key} dress code`),
    };
  });

  const bride = text(value.couple[0], "bride's name");
  const groom = text(value.couple[1], "groom's name");
  return {
    couple: [bride, groom],
    parents: {
      brideFather: text(value.parents.brideFather, "bride's father's name"),
      brideMother: text(value.parents.brideMother, "bride's mother's name"),
      groomFather: text(value.parents.groomFather, "groom's father's name"),
      groomMother: text(value.parents.groomMother, "groom's mother's name"),
    },
    portraits: {
      bride: text(value.portraits.bride, "bride's portrait"),
      groom: text(value.portraits.groom, "groom's portrait"),
    },
    initials: initialsFor([bride, groom]),
    city: text(value.city, "city"),
    hosts: text(value.hosts, "invitation host line"),
    rsvpBy: text(value.rsvpBy, "RSVP date"),
    events,
  };
}

export const eventByKey = (key: string) => WEDDING.events.find((event) => event.key === key);

function parsedDate(iso: string) {
  if (!iso) return null;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? null : value;
}

export const fmtDay = (iso: string) => {
  const date = parsedDate(iso);
  return date ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toLowerCase().replace(",", "") : "date to follow";
};
export const fmtDate = (iso: string) => {
  const date = parsedDate(iso);
  return date ? date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toLowerCase().replace(",", "") : "date to follow";
};
export const fmtTime = (iso: string) => {
  const date = parsedDate(iso);
  return date ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase() : "time to follow";
};

/** A guest's name from the link (?to=the%20sharma%20family), shown on the cover. */
let guest = "";
export const setGuest = (value: string) => {
  guest = value.trim().toLowerCase().slice(0, 40);
};
export const getGuest = () => guest;

/** An .ics calendar file for one event. */
export function icsFor(ev: WeddingEvent) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, "") + "00";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//unfold//wedding invite//EN",
    "BEGIN:VEVENT",
    `UID:${ev.key}-${WEDDING.couple.join("-")}@unfold`,
    `DTSTART:${stamp(ev.start)}`,
    `DTEND:${stamp(ev.end || ev.start)}`,
    `SUMMARY:${ev.name} · ${WEDDING.couple.filter(Boolean).join(" & ")}`,
    `LOCATION:${ev.venue}, ${ev.address}`,
    `DESCRIPTION:dress code: ${ev.dress}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
