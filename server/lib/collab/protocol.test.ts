import { describe, expect, it } from "vitest";
import {
  COLLAB_COLORS,
  COLLAB_MAX_MESSAGE_BYTES,
  COLLAB_MAX_NAME_LENGTH,
  assignColor,
  normalizeColor,
  normalizeCursor,
  parseClientMessage,
  sanitizeDisplayName,
  serializeServerMessage,
} from "./protocol.js";

describe("sanitizeDisplayName", () => {
  it("accepts a normal name", () => {
    expect(sanitizeDisplayName("Budi")).toBe("Budi");
  });

  it("strips control characters, including the newlines that would break a badge", () => {
    expect(sanitizeDisplayName("Bu\ndi\u0000")).toBe("Bu di");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeDisplayName("  Rina   Susanti  ")).toBe("Rina Susanti");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(sanitizeDisplayName("")).toBeNull();
    expect(sanitizeDisplayName("   \n ")).toBeNull();
    expect(sanitizeDisplayName(42)).toBeNull();
  });

  it("caps the length by code point", () => {
    const long = "a".repeat(200);
    expect(sanitizeDisplayName(long)).toHaveLength(COLLAB_MAX_NAME_LENGTH);

    const emoji = "🙂".repeat(40);
    const capped = sanitizeDisplayName(emoji);
    expect(Array.from(capped!)).toHaveLength(COLLAB_MAX_NAME_LENGTH);
    expect(capped).not.toContain("\ufffd");
  });
});

describe("normalizeCursor", () => {
  it("rounds to whole flow pixels", () => {
    expect(normalizeCursor(12.4, -7.6)).toEqual({ x: 12, y: -8 });
  });

  it("rejects non-numbers, infinities and absurd coordinates", () => {
    expect(normalizeCursor("12", 3)).toBeNull();
    expect(normalizeCursor(Number.NaN, 0)).toBeNull();
    expect(normalizeCursor(0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeCursor(1e9, 0)).toBeNull();
  });
});

describe("assignColor", () => {
  it("never repeats a colour already in the room", () => {
    expect(assignColor(COLLAB_COLORS.slice(0, COLLAB_COLORS.length - 1))).toBe(
      COLLAB_COLORS[COLLAB_COLORS.length - 1],
    );
  });

  it("still answers when every colour is taken", () => {
    expect(COLLAB_COLORS).toContain(assignColor(COLLAB_COLORS));
  });
});

describe("normalizeColor", () => {
  it("keeps a plain hex colour and lowercases it", () => {
    expect(normalizeColor("#AABBCC")).toBe("#aabbcc");
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(normalizeColor("red")).toBeUndefined();
    expect(normalizeColor("#abc")).toBeUndefined();
    expect(normalizeColor("url(javascript:1)")).toBeUndefined();
    expect(normalizeColor(null)).toBeUndefined();
  });
});

describe("parseClientMessage", () => {
  it("parses a hello with a name", () => {
    expect(parseClientMessage('{"t":"hello","name":"Budi"}')).toEqual({ t: "hello", name: "Budi", color: undefined });
  });

  it("drops a hello without a usable name", () => {
    expect(parseClientMessage('{"t":"hello","name":"   "}')).toBeNull();
    expect(parseClientMessage('{"t":"hello"}')).toBeNull();
  });

  it("parses a cursor and drops a malformed one", () => {
    expect(parseClientMessage('{"t":"cursor","x":10,"y":20}')).toEqual({ t: "cursor", x: 10, y: 20 });
    expect(parseClientMessage('{"t":"cursor","x":"10","y":20}')).toBeNull();
  });

  it("drops anything that is not an object with a known type", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage("null")).toBeNull();
    expect(parseClientMessage("[1,2,3]")).toBeNull();
    expect(parseClientMessage('{"t":"exec","cmd":"rm -rf /"}')).toBeNull();
  });

  it("drops an oversized frame before parsing it", () => {
    const huge = `{"t":"hello","name":"${"a".repeat(COLLAB_MAX_MESSAGE_BYTES)}"}`;
    expect(parseClientMessage(huge)).toBeNull();
  });
});

describe("serializeServerMessage", () => {
  it("round-trips a welcome", () => {
    const message = {
      t: "welcome" as const,
      id: "peer-1",
      name: "Budi",
      color: COLLAB_COLORS[0],
      peers: [{ id: "peer-2", name: "Rina", color: COLLAB_COLORS[1], x: 5, y: 6 }],
    };
    expect(JSON.parse(serializeServerMessage(message))).toEqual(message);
  });
});
