import { pgTable, text, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";

export const adminUsersTable = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const studiosTable = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  status: text("status", { enum: ["PENDING", "APPROVED", "DISABLED"] }).notNull().default("PENDING"),
  googleDriveRefreshToken: text("google_drive_refresh_token"),
  rootFolderId: text("root_folder_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const albumsTable = pgTable("albums", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studiosTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  driveFolderId: text("drive_folder_id"),
  allowDownload: boolean("allow_download").notNull().default(false),
  allowNotes: boolean("allow_notes").notNull().default(true),
  maxSelection: integer("max_selection").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const photosTable = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  albumId: uuid("album_id").notNull().references(() => albumsTable.id, { onDelete: "cascade" }),
  driveFileId: text("drive_file_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const selectionsTable = pgTable("selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  albumId: uuid("album_id").notNull().references(() => albumsTable.id, { onDelete: "cascade" }),
  photoId: uuid("photo_id").notNull().references(() => photosTable.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  note: text("note"),
  selected: boolean("selected").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
