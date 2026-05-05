/**
 * Tests for parseVideoEmbed — covers all URL forms from the task spec.
 */
import { describe, expect, it } from "vitest";

import { parseVideoEmbed } from "@/src/lib/admin/video-embed";

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------
describe("parseVideoEmbed — YouTube", () => {
  const VALID_ID = "dQw4w9WgXcQ";
  const EXPECTED_EMBED = `https://www.youtube.com/embed/${VALID_ID}?rel=0&modestbranding=1`;

  it("parses youtu.be/<id>", () => {
    const result = parseVideoEmbed(`https://youtu.be/${VALID_ID}`);
    expect(result).toEqual({ provider: "youtube", embedUrl: EXPECTED_EMBED });
  });

  it("parses youtube.com/watch?v=<id>", () => {
    const result = parseVideoEmbed(
      `https://youtube.com/watch?v=${VALID_ID}`,
    );
    expect(result).toEqual({ provider: "youtube", embedUrl: EXPECTED_EMBED });
  });

  it("parses www.youtube.com/watch?v=<id>", () => {
    const result = parseVideoEmbed(
      `https://www.youtube.com/watch?v=${VALID_ID}`,
    );
    expect(result).toEqual({ provider: "youtube", embedUrl: EXPECTED_EMBED });
  });

  it("parses youtube.com/embed/<id>", () => {
    const result = parseVideoEmbed(
      `https://www.youtube.com/embed/${VALID_ID}`,
    );
    expect(result).toEqual({ provider: "youtube", embedUrl: EXPECTED_EMBED });
  });

  it("parses youtube.com/shorts/<id>", () => {
    const result = parseVideoEmbed(
      `https://www.youtube.com/shorts/${VALID_ID}`,
    );
    expect(result).toEqual({ provider: "youtube", embedUrl: EXPECTED_EMBED });
  });

  it("parses m.youtube.com/watch?v=<id>", () => {
    const result = parseVideoEmbed(
      `https://m.youtube.com/watch?v=${VALID_ID}`,
    );
    expect(result).toEqual({ provider: "youtube", embedUrl: EXPECTED_EMBED });
  });

  it("returns MISSING_VIDEO_ID for youtube.com without v param", () => {
    const result = parseVideoEmbed("https://youtube.com/");
    expect(result).toEqual({ error: "MISSING_VIDEO_ID" });
  });

  it("returns MISSING_VIDEO_ID for youtube.com/watch without v", () => {
    const result = parseVideoEmbed("https://www.youtube.com/watch");
    expect(result).toEqual({ error: "MISSING_VIDEO_ID" });
  });
});

// ---------------------------------------------------------------------------
// Vimeo
// ---------------------------------------------------------------------------
describe("parseVideoEmbed — Vimeo", () => {
  const VIMEO_ID = "123456789";

  it("parses vimeo.com/<id>", () => {
    const result = parseVideoEmbed(`https://vimeo.com/${VIMEO_ID}`);
    expect(result).toEqual({
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${VIMEO_ID}`,
    });
  });

  it("parses vimeo.com/<id>/<hash> (private link)", () => {
    const result = parseVideoEmbed(
      `https://vimeo.com/${VIMEO_ID}/abc123def456`,
    );
    expect(result).toEqual({
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${VIMEO_ID}`,
    });
  });

  it("parses player.vimeo.com/video/<id>", () => {
    const result = parseVideoEmbed(
      `https://player.vimeo.com/video/${VIMEO_ID}`,
    );
    expect(result).toEqual({
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${VIMEO_ID}`,
    });
  });

  it("returns MISSING_VIDEO_ID for player.vimeo.com without /video/<id>", () => {
    const result = parseVideoEmbed("https://player.vimeo.com/");
    expect(result).toEqual({ error: "MISSING_VIDEO_ID" });
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------
describe("parseVideoEmbed — error cases", () => {
  it("returns INVALID_URL for a plain string (not a URL)", () => {
    const result = parseVideoEmbed("not a url at all");
    expect(result).toEqual({ error: "INVALID_URL" });
  });

  it("returns INVALID_URL for an empty string", () => {
    const result = parseVideoEmbed("");
    expect(result).toEqual({ error: "INVALID_URL" });
  });

  it("returns UNSUPPORTED_HOST for https://malicious.example.com/<id>", () => {
    const result = parseVideoEmbed(
      "https://malicious.example.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result).toEqual({ error: "UNSUPPORTED_HOST" });
  });

  it("returns INVALID_URL for userinfo bypass (https://x@youtube.com/watch?v=<id>)", () => {
    const result = parseVideoEmbed(
      "https://x@youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result).toEqual({ error: "INVALID_URL" });
  });

  it("returns INVALID_URL for a non-https/http scheme", () => {
    const result = parseVideoEmbed("ftp://youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toEqual({ error: "INVALID_URL" });
  });

  it("returns INVALID_URL for a javascript: URL", () => {
    const result = parseVideoEmbed("javascript:alert(1)");
    expect(result).toEqual({ error: "INVALID_URL" });
  });
});
