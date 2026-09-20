import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { newsService } from "@/lib/news/news-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const newsItem = await newsService.getNewsById(id);
    if (!newsItem) {
      return NextResponse.json({ error: "Nie znaleziono artykułu." }, { status: 404 });
    }

    return NextResponse.json({ news: newsItem });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania artykułu.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
