import dns from "dns/promises";
import { XMLParser } from "fast-xml-parser";
import { SHIELD_LIMITS } from "./shield";

export interface ParsedFeedItem {
  title: string;
  link?: string;
  pubDate: Date;
  content: string;
  summary?: string;
  guid?: string;
  author?: string;
}

export interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  items: ParsedFeedItem[];
}

/**
 * Sprawdza, czy dany adres IPv4 lub IPv6 należy do puli prywatnej / zastrzeżonej (SSRF Defense).
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // IPv4 checks
  if (ip.includes(".")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed IP traktujemy jako niebezpieczny
    }

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;

    // 10.0.0.0/8 (Private network)
    if (parts[0] === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 169.254.0.0/16 (Link-local / Cloud metadata np. 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 172.16.0.0/12 (Private network 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (Private network)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;

    return false;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc00:") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

/**
 * Waliduje URL feedu pod kątem protokołu i ataków SSRF.
 */
export async function validateFeedUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);

    // Tylko protokoły http: i https:
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname;

    // Blokada localhost i popularnych aliasów pętli zwrotnej
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "local" ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

    // Bezpośredni IP w hoście?
    if (isPrivateOrReservedIP(hostname)) {
      return false;
    }

    // Rozwiąż DNS
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return false;
    }

    // Żaden ze zwróconych adresów nie może być adresem prywatnym
    for (const record of addresses) {
      if (isPrivateOrReservedIP(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Bezpieczne pobieranie zawartości feedu z obsługą timeoutu, limitu rozmiaru i redirectów.
 */
export async function fetchSecureFeed(url: string, currentRedirect = 0): Promise<string> {
  if (currentRedirect > SHIELD_LIMITS.FEED_MAX_REDIRECTS) {
    throw new Error("Przekroczono maksymalną liczbę przekierowań (max 3).");
  }

  const isSafe = await validateFeedUrl(url);
  if (!isSafe) {
    throw new Error(`Zablokowano próbę SSRF dla adresu: ${url}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHIELD_LIMITS.FEED_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "manual", // Ręczna obsługa przekierowań dla walidacji SSRF każdego kroku
      headers: {
        "User-Agent": "InvestmentAI-NewsEngine/1.0 (+https://github.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });

    // Obsługa przekierowań (301, 302, 307, 308)
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Brak nagłówka Location przy przekierowaniu.");

      const nextUrl = new URL(location, url).toString();
      return fetchSecureFeed(nextUrl, currentRedirect + 1);
    }

    if (!res.ok) {
      throw new Error(`Błąd HTTP podczas pobierania feedu: ${res.status} ${res.statusText}`);
    }

    // Sprawdź nagłówek Content-Length
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > SHIELD_LIMITS.MAX_FEED_RESPONSE_BYTES) {
      throw new Error("Zawartość feedu przekracza dopuszczalny limit 5 MB.");
    }

    const text = await res.text();
    if (text.length > SHIELD_LIMITS.MAX_FEED_RESPONSE_BYTES) {
      throw new Error("Zawartość feedu przekracza dopuszczalny limit 5 MB.");
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Bezpieczny parser XML/RSS 2.0 i Atom (z wyłączonym XXE i encjami DTD).
 */
export function parseFeedXml(xmlContent: string): ParsedFeed {
  if (!xmlContent || xmlContent.trim().length === 0) {
    throw new Error("Pusta zawartość XML.");
  }

  // fast-xml-parser z całkowicie wyłączonym przetwarzaniem zewnętrznych encji (XXE Guard)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    parseTagValue: false, // Wartości traktowane czysto jako tekst bez ewaluacji typów
    trimValues: true,
    cdataPropName: "__cdata",
    processEntities: false, // Kluczowe dla XXE: encje zewnętrzne NIE są procesowane!
  });

  // Bezpieczne usunięcie deklaracji DOCTYPE i encji DTD przed parsowaniem (XXE Guard)
  const sanitizedXml = xmlContent
    .replace(/<!DOCTYPE[\s\S]*?\]>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "");

  const parsed = parser.parse(sanitizedXml);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Nieprawidłowa struktura XML.");
  }

  // 1. Sprawdź format RSS 2.0
  if (parsed.rss && parsed.rss.channel) {
    return parseRssChannel(parsed.rss.channel);
  }

  // 2. Sprawdź format Atom
  if (parsed.feed) {
    return parseAtomFeed(parsed.feed);
  }

  // 3. Sprawdź kanał na poziomie głównym (niektóre dialekty RDF/RSS 1.0)
  if (parsed["rdf:RDF"] && parsed["rdf:RDF"].item) {
    const rawRdf = parsed["rdf:RDF"].item;
    const items: unknown[] = Array.isArray(rawRdf) ? rawRdf : [rawRdf];
    return {
      title: "RDF Feed",
      items: items.map(mapRssItem).filter((item: ParsedFeedItem | null): item is ParsedFeedItem => item !== null),
    };
  }

  throw new Error("Nierozpoznany format feedu (oczekiwano RSS 2.0 lub Atom).");
}

function extractText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.__cdata) return String(obj.__cdata);
    if (obj["#text"]) return String(obj["#text"]);
  }
  return "";
}

function parseRssChannel(channel: Record<string, unknown>): ParsedFeed {
  const title = extractText(channel.title) || "Untitled Feed";
  const description = extractText(channel.description);
  const link = extractText(channel.link);

  const rawItems = channel.item || [];
  const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

  const items = itemsArray
    .map(mapRssItem)
    .filter((item): item is ParsedFeedItem => item !== null);

  return { title, description, link, items };
}

function mapRssItem(item: unknown): ParsedFeedItem | null {
  if (!item || typeof item !== "object") return null;
  const i = item as Record<string, unknown>;

  const title = extractText(i.title);
  if (!title) return null;

  const content =
    extractText(i["content:encoded"]) ||
    extractText(i.description) ||
    extractText(i.content) ||
    "";

  let pubDate = new Date();
  const dateStr = extractText(i.pubDate) || extractText(i["dc:date"]);
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) pubDate = d;
  }

  const link = extractText(i.link);
  const guid = extractText(i.guid) || link || `${title}_${pubDate.getTime()}`;
  const author = extractText(i.author) || extractText(i["dc:creator"]);

  return {
    title,
    link,
    pubDate,
    content,
    summary: extractText(i.description) || undefined,
    guid,
    author: author || undefined,
  };
}

function parseAtomFeed(feed: Record<string, unknown>): ParsedFeed {
  const title = extractText(feed.title) || "Untitled Atom Feed";
  const description = extractText(feed.subtitle);

  let link: string | undefined;
  if (feed.link) {
    if (typeof feed.link === "object") {
      const l = feed.link as Record<string, unknown>;
      link = l["@_href"] ? String(l["@_href"]) : undefined;
    } else if (typeof feed.link === "string") {
      link = feed.link;
    }
  }

  const rawEntries = feed.entry || [];
  const entriesArray = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  const items = entriesArray
    .map(mapAtomEntry)
    .filter((entry): entry is ParsedFeedItem => entry !== null);

  return { title, description, link, items };
}

function mapAtomEntry(entry: unknown): ParsedFeedItem | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;

  const title = extractText(e.title);
  if (!title) return null;

  let link: string | undefined;
  if (e.link) {
    if (Array.isArray(e.link)) {
      const alt = e.link.find((l: Record<string, unknown>) => l["@_rel"] === "alternate") || e.link[0];
      link = alt?.["@_href"] ? String(alt["@_href"]) : undefined;
    } else if (typeof e.link === "object") {
      const l = e.link as Record<string, unknown>;
      link = l["@_href"] ? String(l["@_href"]) : undefined;
    }
  }

  let pubDate = new Date();
  const dateStr = extractText(e.published) || extractText(e.updated);
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) pubDate = d;
  }

  const content = extractText(e.content) || extractText(e.summary) || "";
  const guid = extractText(e.id) || link || `${title}_${pubDate.getTime()}`;

  let author: string | undefined;
  if (e.author && typeof e.author === "object") {
    const a = e.author as Record<string, unknown>;
    author = extractText(a.name);
  }

  return {
    title,
    link,
    pubDate,
    content,
    summary: extractText(e.summary) || undefined,
    guid,
    author,
  };
}
