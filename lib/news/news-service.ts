import prisma from "@/lib/db/prisma";
import { NewsProcessingStatus, NewsSecurityStatus, SourceTier } from "@prisma/client";
import { acquireLock, releaseLock } from "@/lib/market/cache";
import { fetchSecureFeed, parseFeedXml } from "./feed-parser";
import { generateCanonicalHash, calculateSimHash, findNearDuplicate } from "./deduplication";
import { detectPromptInjection, SHIELD_LIMITS } from "./shield";
import { getAIProvider } from "@/lib/ai/providers";

export interface NewsQueryFilters {
  tier?: SourceTier;
  symbol?: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  securityStatus?: NewsSecurityStatus;
  search?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_FEED_SOURCES = [
  {
    name: "SEC Filings & Disclosures (EDGAR)",
    url: "https://www.sec.gov/news/pressreleases.rss",
    tier: SourceTier.PRIMARY,
    reliabilityScore: 95,
    category: "REGULATORY",
  },
  {
    name: "Federal Reserve Press Releases",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    tier: SourceTier.PRIMARY,
    reliabilityScore: 95,
    category: "CENTRAL_BANK",
  },
  {
    name: "CNBC Finance Top Stories",
    url: "https://search.cnbc.com/rs/search/combinedlist/view.xml?partnerId=wrss01&id=10000664",
    tier: SourceTier.SECONDARY,
    reliabilityScore: 75,
    category: "MARKET_NEWS",
  },
  {
    name: "MarketWatch Top Stories",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    tier: SourceTier.SECONDARY,
    reliabilityScore: 75,
    category: "MARKET_NEWS",
  },
];

export class NewsService {
  /**
   * Inicjalizuje domyślne źródła feedów, jeśli tabela jest pusta.
   */
  async ensureDefaultFeedSources(): Promise<void> {
    const count = await prisma.newsFeedSource.count();
    if (count === 0) {
      for (const feed of DEFAULT_FEED_SOURCES) {
        await prisma.newsFeedSource.upsert({
          where: { url: feed.url },
          update: {},
          create: {
            name: feed.name,
            url: feed.url,
            tier: feed.tier,
            reliabilityScore: feed.reliabilityScore,
            category: feed.category,
            isActive: true,
          },
        });
      }
    }
  }

  /**
   * Pobiera artykuły z pojedynczego źródła RSS/Atom z blokadą rozproszoną i deduplikacją.
   */
  async ingestFromSource(sourceId: string): Promise<{ added: number; skippedDuplicates: number; flagged: number }> {
    const source = await prisma.newsFeedSource.findUnique({
      where: { id: sourceId },
    });

    if (!source || !source.isActive) {
      return { added: 0, skippedDuplicates: 0, flagged: 0 };
    }

    const lockKey = `lock:news-source:${sourceId}`;
    const acquired = await acquireLock(lockKey, 300); // 5 minut TTL
    if (!acquired) {
      return { added: 0, skippedDuplicates: 0, flagged: 0 };
    }

    let added = 0;
    let skippedDuplicates = 0;
    let flagged = 0;

    try {
      // 1. Pobierz XML z SSRF Guard i limitami
      const xmlContent = await fetchSecureFeed(source.url);

      // 2. Bezpieczny parser XML (XXE Guard)
      const feed = parseFeedXml(xmlContent);

      // 3. Pobierz ostatnie SimHashe (ostatnie 3 dni) do wykrywania przedruków agencyjnych
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const recentSimHashes = await prisma.news.findMany({
        where: {
          publishedAt: { gte: threeDaysAgo },
          simHash: { not: null },
        },
        select: { id: true, simHash: true },
      });

      for (const item of feed.items) {
        const title = item.title.slice(0, SHIELD_LIMITS.MAX_TITLE_CHARS);
        const content = item.content.slice(0, SHIELD_LIMITS.MAX_ARTICLE_CHARS);

        // A. Wyznacz kanonikalny SHA-256
        const contentHash = generateCanonicalHash(title, content);

        // B. Sprawdź duplikat 1:1 w bazie
        const existingExact = await prisma.news.findUnique({
          where: { contentHash },
          select: { id: true },
        });

        if (existingExact) {
          skippedDuplicates++;
          continue;
        }

        // C. Oblicz 64-bitowy SimHash i sprawdź near-duplicate (syndykowane kopie)
        const simHash = calculateSimHash(`${title} ${content}`);
        const duplicateOfId = findNearDuplicate(simHash, recentSimHashes, 3);

        // D. Tarcza ochronna Prompt Injection (Defense-in-Depth)
        const injectionCheck = detectPromptInjection(`${title} ${content}`);
        const isFlagged = injectionCheck.isSuspicious;
        const flagReason = injectionCheck.reason || null;
        const securityStatus: NewsSecurityStatus = isFlagged
          ? NewsSecurityStatus.SUSPICIOUS
          : NewsSecurityStatus.CLEAN;

        if (isFlagged) {
          flagged++;
        }

        // E. Zapis w bazie MariaDB
        await prisma.news.create({
          data: {
            title,
            summary: item.summary?.slice(0, SHIELD_LIMITS.MAX_DESCRIPTION_CHARS),
            content,
            source: source.name,
            sourceUrl: item.link || null,
            sourceTier: source.tier,
            sourceReliabilityScore: source.reliabilityScore,
            contentHash,
            simHash,
            duplicateOfId,
            publishedAt: item.pubDate,
            processingStatus: NewsProcessingStatus.PENDING,
            securityStatus,
            isFlagged,
            flagReason,
          },
        });

        added++;
      }

      // Aktualizacja statusu źródła
      await prisma.newsFeedSource.update({
        where: { id: sourceId },
        data: {
          lastFetched: new Date(),
          fetchErrors: 0,
        },
      });
    } catch (error) {
      await prisma.newsFeedSource.update({
        where: { id: sourceId },
        data: {
          fetchErrors: { increment: 1 },
        },
      });
      throw error;
    } finally {
      await releaseLock(lockKey);
    }

    return { added, skippedDuplicates, flagged };
  }

  /**
   * Pobiera wszystkie aktywne źródła po kolei.
   */
  async ingestAllActiveSources(): Promise<{ totalAdded: number; totalSkipped: number; totalFlagged: number }> {
    await this.ensureDefaultFeedSources();

    const sources = await prisma.newsFeedSource.findMany({
      where: { isActive: true },
    });

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalFlagged = 0;

    for (const src of sources) {
      try {
        const res = await this.ingestFromSource(src.id);
        totalAdded += res.added;
        totalSkipped += res.skippedDuplicates;
        totalFlagged += res.flagged;
      } catch (err) {
        console.error(`Błąd pobierania feedu ${src.name}:`, err);
      }
    }

    return { totalAdded, totalSkipped, totalFlagged };
  }

  /**
   * Kolejka AI: przetwarza partię oczekujących unikalnych artykułów.
   * Nie wysyła syndykowanych przedruków (duplicateOfId != null), oszczędzając zasoby.
   */
  async processPendingNewsBatch(batchSize = SHIELD_LIMITS.MAX_ARTICLES_PER_AI_BATCH): Promise<{
    processed: number;
    errors: number;
  }> {
    const pendingArticles = await prisma.news.findMany({
      where: {
        processingStatus: NewsProcessingStatus.PENDING,
        duplicateOfId: null, // Tylko unikalne artykuły główne
      },
      take: batchSize,
      orderBy: { publishedAt: "desc" },
    });

    if (pendingArticles.length === 0) {
      return { processed: 0, errors: 0 };
    }

    const aiProvider = getAIProvider();
    let processed = 0;
    let errors = 0;

    for (const article of pendingArticles) {
      try {
        // 1. Zmień status na PROCESSING
        await prisma.news.update({
          where: { id: article.id },
          data: { processingStatus: NewsProcessingStatus.PROCESSING },
        });

        // 2. Analiza AI w odizolowanym kontekście z Zod validation
        const analysis = await aiProvider.analyzeNewsArticle({
          id: article.id,
          title: article.title,
          content: article.content || article.summary || article.title,
          source: article.source,
          tier: article.sourceTier,
          publishedAt: article.publishedAt,
        });

        // 3. Walidacja Semantyczna Tickerów względem bazy MariaDB Asset
        // AI nie może wymyślać nieistniejących spółek
        const validAssets = await prisma.asset.findMany({
          where: {
            symbol: { in: analysis.mentionedTickers },
            isActive: true,
          },
          select: { id: true, symbol: true },
        });

        // 4. Zapis relacji NewsAsset dla sprawdzonych spółek
        for (const asset of validAssets) {
          const relevance = analysis.tickerRelevance[asset.symbol] ?? 0.8;
          await prisma.newsAsset.upsert({
            where: {
              newsId_assetId: {
                newsId: article.id,
                assetId: asset.id,
              },
            },
            update: {
              relevance,
              sentiment: analysis.sentimentScore,
              confidence: analysis.confidence,
            },
            create: {
              newsId: article.id,
              assetId: asset.id,
              relevance,
              sentiment: analysis.sentimentScore,
              confidence: analysis.confidence,
            },
          });
        }

        // 5. Aktualizacja artykułu o wyniki analizy i status COMPLETED
        await prisma.news.update({
          where: { id: article.id },
          data: {
            summary: analysis.summary,
            sentimentScore: analysis.sentimentScore,
            processingStatus: NewsProcessingStatus.COMPLETED,
            processedAt: new Date(),
          },
        });

        processed++;
      } catch (err) {
        console.error(`Błąd analizy AI artykułu ${article.id}:`, err);
        await prisma.news.update({
          where: { id: article.id },
          data: {
            processingStatus: NewsProcessingStatus.FAILED,
          },
        });
        errors++;
      }
    }

    return { processed, errors };
  }

  /**
   * Zwraca listę artykułów z filtrami i paginacją.
   */
  async getNews(filters: NewsQueryFilters = {}) {
    const {
      tier,
      symbol,
      sentiment,
      securityStatus,
      search,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;
    const whereClause: Record<string, unknown> = {};

    if (tier) {
      whereClause.sourceTier = tier;
    }

    if (securityStatus) {
      whereClause.securityStatus = securityStatus;
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      whereClause.OR = [
        { title: { contains: q } },
        { summary: { contains: q } },
      ];
    }

    if (symbol) {
      const normSymbol = symbol.trim().toUpperCase();
      whereClause.newsAssets = {
        some: {
          asset: {
            symbol: normSymbol,
          },
        },
      };
    }

    if (sentiment) {
      if (sentiment === "bullish") {
        whereClause.sentimentScore = { gte: 0.2 };
      } else if (sentiment === "bearish") {
        whereClause.sentimentScore = { lte: -0.2 };
      } else if (sentiment === "neutral") {
        whereClause.sentimentScore = { gt: -0.2, lt: 0.2 };
      }
    }

    const [items, total] = await Promise.all([
      prisma.news.findMany({
        where: whereClause,
        include: {
          newsAssets: {
            include: {
              asset: {
                select: { id: true, symbol: true, name: true },
              },
            },
          },
          duplicateOf: {
            select: { id: true, title: true, source: true },
          },
        },
        orderBy: { publishedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.news.count({ where: whereClause }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Zwraca wiadomości powiązane z konkretnym aktywem (do widoku szczegółów instrumentu).
   */
  async getNewsForAsset(symbol: string, limit = 5) {
    const normSymbol = symbol.trim().toUpperCase();

    return prisma.news.findMany({
      where: {
        newsAssets: {
          some: {
            asset: { symbol: normSymbol },
          },
        },
      },
      include: {
        newsAssets: {
          include: {
            asset: { select: { symbol: true, name: true } },
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Zwraca pojedynczy artykuł po ID.
   */
  async getNewsById(id: string) {
    return prisma.news.findUnique({
      where: { id },
      include: {
        newsAssets: {
          include: {
            asset: true,
          },
        },
        duplicateOf: true,
        duplicates: {
          select: { id: true, title: true, source: true, publishedAt: true },
        },
      },
    });
  }
}

export const newsService = new NewsService();
