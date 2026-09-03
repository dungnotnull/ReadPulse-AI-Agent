import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });
  const report = await prisma.report.findUnique({ where: { slug } });
  if (!report) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ report });
}

export async function PATCH(req: Request) {
  // attach RAN score to an existing report
  const body = (await req.json().catch(() => null)) as { slug?: string; ranScore?: unknown } | null;
  if (!body?.slug || !body?.ranScore) {
    return Response.json({ error: "slug, ranScore required" }, { status: 400 });
  }
  try {
    await prisma.report.update({
      where: { slug: body.slug },
      data: { ranScore: JSON.stringify(body.ranScore) },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "report not found" }, { status: 404 });
  }
}
