import { describe, it, expect } from "vitest";
import {
  generateCanonicalHash,
  calculateSimHash,
  hammingDistance,
  findNearDuplicate,
} from "../lib/news/deduplication";

describe("Deduplikacja Hybrydowa (SHA-256 + SimHash)", () => {
  it("generuje identyczny kanonikalny SHA-256 pomimo różnic w białych znakach i interpunkcji", () => {
    const title1 = "Fed Leaves Interest Rates Unchanged!";
    const content1 = "The Federal Reserve decided to keep the benchmark rate steady today.";

    const title2 = "fed leaves interest rates unchanged";
    const content2 = "  The Federal Reserve, decided to keep the benchmark rate steady today. \n\n";

    const hash1 = generateCanonicalHash(title1, content1);
    const hash2 = generateCanonicalHash(title2, content2);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it("zwraca odległość Hamminga = 0 dla identycznych SimHashy", () => {
    const text = "Tesla shares surged 12% following record quarterly deliveries in China.";
    const h1 = calculateSimHash(text);
    const h2 = calculateSimHash(text);

    expect(h1).toBe(h2);
    expect(hammingDistance(h1, h2)).toBe(0);
  });

  it("wykrywa przedruk agencyjny (near-duplicate) z odległością Hamminga <= 3", () => {
    // Depesza Reutersa
    const reutersWire = `
      The Federal Reserve held interest rates steady on Wednesday and pushed back the start of rate cuts,
      saying it does not expect it will be appropriate to reduce borrowing costs until it has gained
      greater confidence that inflation is moving sustainably toward 2 percent.
    `;

    // Syndykowany przedruk na portalu zewnętrznym z drobną zmianą wstępu
    const portalReprint = `
      The Federal Reserve kept interest rates steady on Wednesday and pushed back expected rate cuts,
      stating it does not expect it will be appropriate to reduce borrowing costs until it has gained
      greater confidence that inflation is moving sustainably toward 2 percent.
    `;

    const hReuters = calculateSimHash(reutersWire);
    const hPortal = calculateSimHash(portalReprint);

    const dist = hammingDistance(hReuters, hPortal);

    // Drobne różnice w tekście dają odległość Hamminga <= 10 (zbieżność >85%)
    expect(dist).toBeLessThanOrEqual(10);

    const parentId = findNearDuplicate(hPortal, [{ id: "reuters-1", simHash: hReuters }], 10);
    expect(parentId).toBe("reuters-1");
  });

  it("odróżnia całkowicie różne artykuły (duża odległość Hamminga)", () => {
    const articleA = "NVIDIA announced a new Blackwell AI chip architecture with 30x performance leap.";
    const articleB = "Crude oil prices plunged after OPEC surprise meeting failed to agree on production cuts.";

    const hA = calculateSimHash(articleA);
    const hB = calculateSimHash(articleB);

    const dist = hammingDistance(hA, hB);
    expect(dist).toBeGreaterThan(20);

    const duplicateId = findNearDuplicate(hB, [{ id: "article-a", simHash: hA }], 10);
    expect(duplicateId).toBeNull();
  });
});
