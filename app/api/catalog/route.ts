import { fallbackCatalog, refreshCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

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
    return json(await refreshCatalog());
  } catch {
    return json(fallbackCatalog());
  }
}

export async function POST() {
  try {
    return json(await refreshCatalog());
  } catch {
    return json(fallbackCatalog());
  }
}
