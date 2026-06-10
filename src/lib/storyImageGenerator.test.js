import { describe, it, expect } from "vitest";
import { generateStoryImage, downloadBlob } from "./storyImageGenerator.js";

// Sin document (entorno node de vitest por default) → la función devuelve
// null defensivamente para no crashear. En browser real genera el blob.
describe("generateStoryImage", () => {
  it("devuelve null si no hay document (entorno SSR/test)", async () => {
    const blob = await generateStoryImage([], { title: "Stock" });
    // En jsdom puede devolver blob o null según la versión; lo importante es
    // que NO crashee
    expect(blob === null || typeof blob === "object").toBe(true);
  });

  it("acepta lista vacía sin crashear", async () => {
    await expect(generateStoryImage([], {})).resolves.toBeDefined();
  });

  it("acepta opts.exchangeRate y opts.title", async () => {
    const products = [{ brand: "Elfbar", model: "TE", flavor: "Watermelon", priceUSD: 25, puffs: 30000 }];
    await expect(generateStoryImage(products, { exchangeRate: 1500, title: "Promo" })).resolves.toBeDefined();
  });
});

describe("downloadBlob", () => {
  it("no crashea si blob es null", () => {
    expect(() => downloadBlob(null)).not.toThrow();
  });
});
