import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    price: real("price"),
    currency: text("currency").notNull(),
    priceCny: real("price_cny"),
    stockStatus: text("stock_status").notNull(),
    stockCount: integer("stock_count"),
    verification: text("verification").notNull(),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    checkedAt: text("checked_at").notNull(),
    latencyMs: integer("latency_ms"),
  },
  (table) => [
    index("price_snapshots_source_id_idx").on(table.sourceId, table.id),
    index("price_snapshots_checked_at_idx").on(table.checkedAt),
  ]
);
