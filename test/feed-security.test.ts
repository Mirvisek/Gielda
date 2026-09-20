import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedIP,
  validateFeedUrl,
  parseFeedXml,
} from "../lib/news/feed-parser";

describe("Bezpieczeństwo Parsera Feedu (SSRF Guard & XXE Defense)", () => {
  it("blokuje adresy prywatne i chmurowe metadane (SSRF Guard)", () => {
    // Loopback
    expect(isPrivateOrReservedIP("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIP("127.0.0.2")).toBe(true);

    // RFC 1918 Private ranges
    expect(isPrivateOrReservedIP("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIP("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIP("192.168.1.1")).toBe(true);

    // AWS / Cloud metadata service
    expect(isPrivateOrReservedIP("169.254.169.254")).toBe(true);

    // IPv6 loopback
    expect(isPrivateOrReservedIP("::1")).toBe(true);

    // Publiczne IP powinny przejść
    expect(isPrivateOrReservedIP("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIP("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIP("142.250.180.206")).toBe(false);
  });

  it("odrzuca niebezpieczne schematy i adresy URL w validateFeedUrl", async () => {
    expect(await validateFeedUrl("file:///etc/passwd")).toBe(false);
    expect(await validateFeedUrl("ftp://ftp.example.com/rss.xml")).toBe(false);
    expect(await validateFeedUrl("gopher://example.com")).toBe(false);
    expect(await validateFeedUrl("http://localhost:3000/feed")).toBe(false);
    expect(await validateFeedUrl("http://127.0.0.1:8080/rss")).toBe(false);
    expect(await validateFeedUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("jest odporny na ataki XXE (XML External Entity) i ignoruje zewnętrzne encje DTD", () => {
    // Klasyczny payload XXE próbujący wyciec pliki systemowe
    const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE foo [
      <!ELEMENT foo ANY >
      <!ENTITY xxe SYSTEM "file:///etc/passwd" >
    ]>
    <rss version="2.0">
      <channel>
        <title>Test Feed &xxe;</title>
        <link>https://example.com</link>
        <item>
          <title>Artykuł o akcjach</title>
          <description>Treść &xxe;</description>
        </item>
      </channel>
    </rss>`;

    const feed = parseFeedXml(xxePayload);
    expect(feed.title).toBeDefined();
    expect(feed.items.length).toBe(1);
    // Encja zewnętrzna nie została rozwinięta do zawartości pliku
    expect(feed.items[0].content).not.toContain("root:x:0:0");
  });

  it("poprawnie parsuje standardowy format RSS 2.0 z CDATA", () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Giełda i Rynki RSS</title>
        <link>https://gielda.example.com</link>
        <description>Wiadomości finansowe</description>
        <item>
          <title><![CDATA[Apple zapowiada nową generację procesorów]]></title>
          <link>https://gielda.example.com/art-1</link>
          <description><![CDATA[Firma Apple ogłosiła premierę układu M4 podczas konferencji.]]></description>
          <pubDate>Wed, 18 Sep 2026 12:00:00 GMT</pubDate>
          <guid>art-1-apple</guid>
        </item>
      </channel>
    </rss>`;

    const feed = parseFeedXml(rssXml);
    expect(feed.title).toBe("Giełda i Rynki RSS");
    expect(feed.items.length).toBe(1);
    expect(feed.items[0].title).toBe("Apple zapowiada nową generację procesorów");
    expect(feed.items[0].content).toContain("Firma Apple ogłosiła premierę");
    expect(feed.items[0].link).toBe("https://gielda.example.com/art-1");
  });

  it("poprawnie parsuje standardowy format Atom 1.0", () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed Finansowy</title>
      <subtitle>Notowania i wiadomości</subtitle>
      <entry>
        <title>NVIDIA bije oczekiwania analityków</title>
        <link href="https://example.com/nvda-earnings" rel="alternate"/>
        <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
        <updated>2026-09-19T14:30:00Z</updated>
        <summary>Wyniki kwartalne spółki NVIDIA przewyższyły konsensus rynkowy o 18%.</summary>
      </entry>
    </feed>`;

    const feed = parseFeedXml(atomXml);
    expect(feed.title).toBe("Atom Feed Finansowy");
    expect(feed.items.length).toBe(1);
    expect(feed.items[0].title).toBe("NVIDIA bije oczekiwania analityków");
    expect(feed.items[0].link).toBe("https://example.com/nvda-earnings");
    expect(feed.items[0].content).toContain("Wyniki kwartalne spółki NVIDIA");
  });

  it("rzuca czytelny błąd dla uszkodzonego XML bez awarii procesu", () => {
    expect(() => parseFeedXml("<broken>not closed xml")).toThrow();
  });
});
