import { readLatestOffers, saveSnapshots } from "@/db/history";
import { emptyOffers, isVerifiedAvailable, refreshAllSources, type Offer } from "@/lib/monitor";

export const dynamic = "force-dynamic";

function payload(offers: Offer[], mode: "live" | "snapshot", message?: string) {
  const checkedAt = offers
    .map((offer) => offer.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return {
    mode,
    checkedAt,
    offers,
    coverage: {
      total: offers.length,
      verified: offers.filter(isVerifiedAvailable).length,
      failed: offers.filter((offer) => offer.verification === "failed").length,
    },
    message,
  };
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET() {
  try {
    return json(payload(await readLatestOffers(), "snapshot"));
  } catch {
    return json(payload(emptyOffers(), "snapshot", "历史档案尚未建立，请点击实时核验。"));
  }
}

export async function POST() {
  try {
    const liveOffers = await refreshAllSources();
    try {
      await saveSnapshots(liveOffers);
      return json(payload(await readLatestOffers(), "live"));
    } catch {
      return json(payload(liveOffers, "live", "本轮实时结果已返回，但历史档案暂时无法写入。"));
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "实时核验失败" }, 500);
  }
}
