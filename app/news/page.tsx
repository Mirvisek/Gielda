import { requireAuth } from "@/lib/auth/guards";
import { newsService } from "@/lib/news/news-service";
import NewsClient from "./news-client";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  await requireAuth();

  // Pobierz pierwszą stronę wiadomości
  const initialNews = await newsService.getNews({ page: 1, limit: 20 });

  return <NewsClient initialNews={initialNews} />;
}
