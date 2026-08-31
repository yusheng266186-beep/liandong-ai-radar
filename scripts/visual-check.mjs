import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const basePath = "/liandong-ai-radar";
const staticRoot = path.resolve("out");
let server;
let target = process.env.VISUAL_CHECK_URL;
if (!target) {
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  server = createServer(async (request, response) => {
    try {
      let requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (!requestPath.startsWith(basePath)) throw new Error("not found");
      requestPath = requestPath.slice(basePath.length) || "/";
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
  target = `http://127.0.0.1:4173${basePath}/`;
}
const output = path.resolve("outputs");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
for (const profile of [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, fullPage: true },
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
  results.push({
    profile: profile.name,
    title: await page.title(),
    offers: await page.locator(profile.name === "mobile" ? ".offer-mobile-card" : ".offer-table tbody tr").count(),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    consoleErrors,
    pageErrors,
  });
  await page.close();
}
await browser.close();
if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
