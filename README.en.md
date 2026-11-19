# Liandong AI Radar · Public Listing Monitor

[中文说明](README.md) · [Open the dashboard](https://yusheng266186-beep.github.io/liandong-ai-radar/)

A dashboard for comparing public AI digital-product listings. It collects displayed offer information, preserves links to the sources, and lets readers assess price, availability evidence, and changes over time.

## What to look at

- Search by product and source. Compare the same tier, unit, and delivery format.
- Check the last observation and stock evidence before relying on a listing. Availability labels describe the archived evidence and may lag the original storefront.
- Use the source link to verify current terms. A historical price or inventory change is an observation, and a drop in observed stock alone cannot establish sales volume.

## Data pipeline and development

A Next.js front end reads generated snapshots. The collection scripts update evidence from public pages. GitHub Actions prepares the Pages output and caches crawl state between runs. Funnel fixes to the collection and data validation paths, then check the static build.

~~~bash
npm ci
npm run dev
~~~

Use Node.js 22.13 or later. <code>npm run lint</code>, <code>npm run test</code>, and <code>npm run build</code> cover static checks, tests, and the front-end build. The Chinese guide describes the crawler, evidence labels, and how to inspect per-source data. The original project uses the [MIT License](LICENSE). Listings and seller content keep their source terms.
