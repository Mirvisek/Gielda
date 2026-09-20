import { createHash } from "crypto";
import { normalizeUnicodeAndText } from "./shield";

/**
 * 1. Kanonikalny SHA-256 dla dokładnej deduplikacji 1:1.
 * Usuwa różnice w interpunkcji, wielkości liter i białych znakach.
 */
export function generateCanonicalHash(title: string, content: string): string {
  const normTitle = normalizeUnicodeAndText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  const normContent = normalizeUnicodeAndText(content)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  const combined = `${normTitle}###${normContent}`;
  return createHash("sha256").update(combined).digest("hex");
}

/**
 * 64-bit FNV-1a Hash dla pojedynczego tokenu / shingle.
 */
function fnv1a64(str: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash;
}

/**
 * 2. 64-bitowy SimHash do wykrywania niemal identycznych przedruków (near-duplicates).
 * Dzieli tekst na słowa / 3-słowne shingle, waży je i generuje 64-bitowy wektor cech.
 */
export function calculateSimHash(text: string): string {
  const normalized = normalizeUnicodeAndText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ").filter((w) => w.length > 1);
  if (words.length === 0) {
    return "0000000000000000";
  }

  // Ważone cechy: unigramy (waga zależna od długości słowa) + bigramy
  const features: { token: string; weight: number }[] = [];

  for (const word of words) {
    features.push({ token: word, weight: Math.min(4, Math.max(1, word.length - 2)) });
  }

  for (let i = 0; i < words.length - 1; i++) {
    features.push({ token: `${words[i]}_${words[i + 1]}`, weight: 2 });
  }

  // Wektor 64-bitowy
  const v = new Array(64).fill(0);

  for (const { token, weight } of features) {
    const hash = fnv1a64(token);
    for (let bit = 0; bit < 64; bit++) {
      const isSet = (hash >> BigInt(bit)) & 1n;
      v[bit] += isSet === 1n ? weight : -weight;
    }
  }

  // Zbuduj 64-bitowy wynik
  let simHashBigInt = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (v[bit] > 0) {
      simHashBigInt |= 1n << BigInt(bit);
    }
  }

  // Zwróć jako 16-znakowy hex string (64 bity)
  return simHashBigInt.toString(16).padStart(16, "0");
}

/**
 * 3. Oblicza odległość Hamminga pomiędzy dwoma 64-bitowymi SimHashami.
 * Zwraca liczbę różniących się bitów (od 0 do 64).
 */
export function hammingDistance(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== 16 || hashB.length !== 16) {
    return 64;
  }

  try {
    const valA = BigInt("0x" + hashA);
    const valB = BigInt("0x" + hashB);
    let xor = valA ^ valB;

    // Brian Kernighan's algorithm do zliczania ustawionych bitów
    let count = 0;
    while (xor > 0n) {
      xor &= xor - 1n;
      count++;
    }

    return count;
  } catch {
    return 64;
  }
}

/**
 * 4. Wyszukuje near-duplicate w istniejącym zbiorze SimHashy.
 * Domyślny próg Hamminga <= 3 oznacza zbieżność treści rzędu ~90%+.
 */
export function findNearDuplicate(
  simHash: string,
  existingList: { id: string; simHash: string | null }[],
  threshold = 10
): string | null {
  if (!simHash || existingList.length === 0) return null;

  for (const item of existingList) {
    if (!item.simHash) continue;
    const dist = hammingDistance(simHash, item.simHash);
    if (dist <= threshold) {
      return item.id;
    }
  }

  return null;
}
