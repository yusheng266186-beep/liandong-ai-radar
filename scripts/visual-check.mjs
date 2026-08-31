import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const basePath = "/liandong-ai-radar";
const staticRoot = path.resolve("out");
let server;
let target = process.env.VISUAL_CHECK_URL;
if (!target) {
  const exportedHtml = await readFile(path.join(staticRoot, "index.html"), "utf8");
  const usesRepositoryBasePath = exportedHtml.includes(`${basePath}/_next/`);
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  server = createServer(async (request, response) => {
    try {
      let requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (requestPath.startsWith(basePath)) requestPath = requestPath.slice(basePath.length) || "/";
      let filePath = path.join(staticRoot, requestPath);
      if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, "index.html");
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": mime[path.extname(filePath)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
  target = `http://127.0.0.1:4173${usesRepositoryBasePath ? basePath : ""}/`;
}
const output = path.resolve("outputs");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
for (const profile of [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, fullPage: true },
  { name: "tablet", viewport: { width: 1024, height: 900 }, fullPage: true },
  { name: "mobile", viewport: { width: 390, height: 844 }, fullPage: true },
]) {
  const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(target, { waitUntil: "networkidle", timeout: 30_000 });
  await page.screenshot({ path: path.join(output, `${profile.name}.png`), fullPage: profile.fullPage });
  await page.screenshot({ path: path.join(output, `${profile.name}-top.png`), fullPage: false });
  await page.locator("#catalog").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(output, `${profile.name}-catalog.png`), fullPage: false });
  const layoutAudit = await page.evaluate(() => {
    const audited = [...document.querySelectorAll(".topbar, .command-hero, .health-panel, .evidence-strip, .catalog-toolbar, .result-bar, .pagination, .method-section, .site-footer")];
    const clippedContainers = audited.filter((element) => element.scrollWidth > element.clientWidth + 2).map((element) => ({ className: element.className, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    const controls = [...document.querySelectorAll("button, a, input, select")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const tinyControls = controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: element.className, label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) };
    }).filter((item) => item.width < 38 || item.height < 38);
    return { clippedContainers, tinyControls };
  });
  results.push({
    profile: profile.name,
    title: await page.title(),
    offers: await page.locator(profile.name === "mobile" ? ".offer-mobile-card" : ".offer-table tbody tr").count(),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    ...layoutAudit,
    consoleErrors,
    pageErrors,
  });
  await page.close();
}
await browser.close();
if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (results.some((result) => result.horizontalOverflow || result.consoleErrors.length || result.pageErrors.length || result.clippedContainers.length || result.tinyControls.length)) process.exitCode = 1;
