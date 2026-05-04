import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  logoUrl: text("logo_url").notNull(),
  primaryColor: text("primary_color").notNull().default("#306030"),
  accentColor: text("accent_color").notNull().default("#A0C040"),
  isSystem: boolean("is_system").notNull().default(false),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
