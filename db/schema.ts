import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  studentName: text("student_name"),
  currentCourse: text("current_course"),
  targetCourse: text("target_course"),
  status: text("status").notNull().default("draft"),
  result: text("result"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const jobFiles = sqliteTable("job_files", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  ownerEmail: text("owner_email").notNull(),
  category: text("category").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  storageKey: text("storage_key").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const userSettings = sqliteTable("user_settings", {
  ownerEmail: text("owner_email").primaryKey(),
  model: text("model").notNull().default("gpt-5-mini"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const contextPhrases = sqliteTable("context_phrases", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  category: text("category").notNull(),
  phrase: text("phrase").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
