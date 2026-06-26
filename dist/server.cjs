var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_nodemailer = __toESM(require("nodemailer"), 1);
var import_blob = require("@vercel/blob");
var import_serverless = require("@neondatabase/serverless");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
var POSTS_FILE = import_path.default.join(process.cwd(), "posts.json");
var SETTINGS_FILE = import_path.default.join(process.cwd(), "settings.json");
var BOOKINGS_FILE = import_path.default.join(process.cwd(), "bookings.json");
var DEFAULT_SETTINGS = {
  whatsappNumber: "393331234567",
  streamTitle: "Visual Stream",
  streamSubtitle: "Le migliori scoperte e novit\xE0 esclusive selezionate questa settimana in anteprima assoluta.",
  notificationEmail: "castromassimo@gmail.com"
};
var IS_VERCEL = !!process.env.VERCEL;
var DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
var hasDatabase = !!DB_URL;
function getDb() {
  if (!DB_URL) throw new Error("DATABASE_URL non configurato");
  return (0, import_serverless.neon)(DB_URL);
}
async function initDb() {
  if (!hasDatabase) {
    console.log("[DB] DATABASE_URL non trovato \u2014 uso file JSON locali.");
    return;
  }
  try {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS vs_posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        price TEXT,
        description TEXT,
        media_type TEXT NOT NULL DEFAULT 'image',
        media_url TEXT NOT NULL,
        cta_text TEXT,
        whatsapp_message TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        click_count INTEGER NOT NULL DEFAULT 0,
        overlay_text TEXT,
        overlay_x REAL,
        overlay_y REAL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS vs_settings (
        key TEXT PRIMARY KEY DEFAULT 'main',
        value TEXT NOT NULL DEFAULT '{}'
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS vs_bookings (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        post_title TEXT NOT NULL,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        guests INTEGER NOT NULL DEFAULT 1,
        phone TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log("[DB] Tabelle Neon pronte.");
  } catch (err) {
    console.error("[DB] Errore inizializzazione tabelle:", err);
  }
}
function rowToPost(row) {
  let tags = [];
  try {
    tags = JSON.parse(row.tags || "[]");
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    price: row.price ?? void 0,
    description: row.description ?? void 0,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    ctaText: row.cta_text ?? void 0,
    whatsappMessage: row.whatsapp_message ?? void 0,
    tags,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    expiresAt: row.expires_at ? row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at) : null,
    clickCount: row.click_count ?? 0,
    overlayText: row.overlay_text ?? void 0,
    overlayX: row.overlay_x !== null ? Number(row.overlay_x) : void 0,
    overlayY: row.overlay_y !== null ? Number(row.overlay_y) : void 0
  };
}
function rowToBooking(row) {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    date: row.date,
    name: row.name,
    guests: Number(row.guests),
    phone: row.phone,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}
async function readPosts() {
  if (hasDatabase) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT * FROM vs_posts ORDER BY created_at DESC`;
      console.log(`[ReadPosts] ${rows.length} post letti da Neon.`);
      return rows.map(rowToPost);
    } catch (err) {
      console.error("[ReadPosts] Errore DB:", err);
      return [];
    }
  }
  try {
    if (!import_fs.default.existsSync(POSTS_FILE)) {
      import_fs.default.writeFileSync(POSTS_FILE, JSON.stringify(INITIAL_POSTS, null, 2), "utf-8");
      return INITIAL_POSTS;
    }
    return JSON.parse(import_fs.default.readFileSync(POSTS_FILE, "utf-8"));
  } catch (error) {
    console.error("[ReadPosts] Errore file locale:", error);
    return INITIAL_POSTS;
  }
}
async function writePosts(posts) {
  if (hasDatabase) {
    try {
      const sql = getDb();
      await sql`DELETE FROM vs_posts`;
      for (const p of posts) {
        const tags = JSON.stringify(p.tags ?? []);
        await sql`
          INSERT INTO vs_posts (id, title, price, description, media_type, media_url, cta_text,
            whatsapp_message, tags, created_at, expires_at, click_count, overlay_text, overlay_x, overlay_y)
          VALUES (${p.id}, ${p.title}, ${p.price ?? null}, ${p.description ?? null},
            ${p.mediaType}, ${p.mediaUrl}, ${p.ctaText ?? null}, ${p.whatsappMessage ?? null},
            ${tags}, ${p.createdAt}, ${p.expiresAt ?? null}, ${p.clickCount ?? 0},
            ${p.overlayText ?? null}, ${p.overlayX ?? null}, ${p.overlayY ?? null})
        `;
      }
      console.log(`[WritePosts] ${posts.length} post salvati su Neon.`);
      return true;
    } catch (err) {
      console.error("[WritePosts] Errore DB:", err);
      return false;
    }
  }
  try {
    import_fs.default.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[WritePosts] Errore file locale:", error);
    return false;
  }
}
async function readSettings() {
  if (hasDatabase) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT value FROM vs_settings WHERE key = 'main'`;
      if (rows.length > 0) {
        try {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value) };
        } catch {
          return DEFAULT_SETTINGS;
        }
      }
      return DEFAULT_SETTINGS;
    } catch (err) {
      console.error("[ReadSettings] Errore DB:", err);
      return DEFAULT_SETTINGS;
    }
  }
  try {
    if (!import_fs.default.existsSync(SETTINGS_FILE)) {
      import_fs.default.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(import_fs.default.readFileSync(SETTINGS_FILE, "utf-8")) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
async function writeSettings(settings) {
  if (hasDatabase) {
    try {
      const sql = getDb();
      const value = JSON.stringify(settings);
      await sql`
        INSERT INTO vs_settings (key, value) VALUES ('main', ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
      return true;
    } catch (err) {
      console.error("[WriteSettings] Errore DB:", err);
      return false;
    }
  }
  try {
    import_fs.default.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[WriteSettings] Errore file locale:", error);
    return false;
  }
}
async function readBookings() {
  if (hasDatabase) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT * FROM vs_bookings ORDER BY created_at DESC`;
      return rows.map(rowToBooking);
    } catch (err) {
      console.error("[ReadBookings] Errore DB:", err);
      return [];
    }
  }
  try {
    if (!import_fs.default.existsSync(BOOKINGS_FILE)) {
      import_fs.default.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    return JSON.parse(import_fs.default.readFileSync(BOOKINGS_FILE, "utf-8"));
  } catch (error) {
    console.error("[ReadBookings] Errore file locale:", error);
    return [];
  }
}
async function writeBookings(bookings) {
  if (hasDatabase) {
    try {
      const sql = getDb();
      await sql`DELETE FROM vs_bookings`;
      for (const b of bookings) {
        await sql`
          INSERT INTO vs_bookings (id, post_id, post_title, date, name, guests, phone, created_at)
          VALUES (${b.id}, ${b.postId}, ${b.postTitle}, ${b.date}, ${b.name}, ${b.guests}, ${b.phone}, ${b.createdAt})
        `;
      }
      return true;
    } catch (err) {
      console.error("[WriteBookings] Errore DB:", err);
      return false;
    }
  }
  try {
    import_fs.default.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[WriteBookings] Errore file locale:", error);
    return false;
  }
}
async function cleanupExpiredBookings() {
  if (hasDatabase) {
    try {
      const sql = getDb();
      await sql`
        DELETE FROM vs_bookings
        WHERE date ~ '^\d{4}-\d{2}-\d{2}$'
        AND (date::date + INTERVAL '1 day') <= NOW()
      `;
      return;
    } catch (err) {
      console.error("[Auto-Cleanup] Errore DB:", err);
    }
  }
  try {
    const bookings = await readBookings();
    const now = /* @__PURE__ */ new Date();
    const active = bookings.filter((b) => {
      if (!b.date) return true;
      const [y, m, d] = b.date.split("-").map(Number);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return true;
      return now < new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    });
    if (active.length !== bookings.length) {
      console.log(`[Auto-Cleanup] Rimossi ${bookings.length - active.length} prenotazioni scadute.`);
      await writeBookings(active);
    }
  } catch (err) {
    console.error("[Auto-Cleanup] Errore cleanup:", err);
  }
}
async function cleanupExpiredBlobs() {
  console.log("[Blob-Cleanup] Pulizia blob disattivata (solo manuale).");
}
var INITIAL_POSTS = [
  {
    id: "seeded-1",
    title: "Caff\xE8 Specialty Etiopia Yirgacheffe",
    price: "\u20AC18.50",
    description: "Note floreali di gelsomino, pesca bianca e un delicato retrogusto di miele agrumato. Raccolto a mano a 2.100 metri d'altezza, tostato fresco artigianalmente ogni marted\xEC. Un'esperienza sensoriale pura per veri appassionati.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800&auto=format&fit=crop",
    ctaText: "Ordina via WhatsApp",
    whatsappMessage: "Ciao! Vorrei maggiori informazioni sul Caff\xE8 Specialty Etiopia Yirgacheffe (\u20AC18.50). \xC8 ancora disponibile per la spedizione?",
    tags: ["Specialty Coffee", "Edizione Limitata", "Tostatura Fresca"],
    createdAt: "2026-06-24T08:00:00.000Z",
    expiresAt: "2026-06-26T18:00:00.000Z",
    // Expires in ~2 days
    clickCount: 14
  },
  {
    id: "seeded-2",
    title: "Borsa Messenger in Pelle Artigianale",
    price: "\u20AC145.00",
    description: "Realizzata in pregiata pelle bovina conciata al vegetale in Toscana. Cuciture rinforzate in filo cerato, interni organizzati con scomparto imbottito per laptop fino a 14 pollici. Progettata per invecchiare con carattere.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop",
    ctaText: "Richiedi Disponibilit\xE0",
    whatsappMessage: "Ciao! Ho visto sul Visual Stream la Borsa Messenger in Pelle Artigianale (\u20AC145.00). Quali sono i tempi di consegna?",
    tags: ["Artigianato", "Vera Pelle", "Bestseller"],
    createdAt: "2026-06-23T10:00:00.000Z",
    expiresAt: null,
    // Persistent
    clickCount: 29
  },
  {
    id: "seeded-3",
    title: "Poltrona Lounge Minimale 'Nordic Slate'",
    price: "\u20AC320.00",
    description: "Linee pulite, struttura in legno massello di rovere cerato e rivestimento in tessuto boucl\xE9 color avorio ad alta resistenza. Progettata per offrire il massimo comfort ergonomico senza ingombrare visivamente il tuo spazio.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?q=80&w=800&auto=format&fit=crop",
    ctaText: "Prenota con Acconto",
    whatsappMessage: "Ciao! Vorrei pre-ordinare la Poltrona Lounge Minimale Nordic Slate (\u20AC320.00) vista nella vetrina. Mi spieghi come procedere?",
    tags: ["Design Interni", "Pre-Ordine", "Home Decor"],
    createdAt: "2026-06-22T15:30:00.000Z",
    expiresAt: "2026-06-29T20:00:00.000Z",
    // Expires in ~5 days
    clickCount: 8
  },
  {
    id: "seeded-4",
    title: "Tastiera Meccanica Custom 'Sunset Glow'",
    price: "\u20AC189.00",
    description: "Switch tattili personalizzati e lubrificati a mano per un suono profondo e ovattato. Keycaps PBT a sublimazione con gradiente tramonto, case in alluminio CNC anodizzato grigio siderale e retroilluminazione calda.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1618384887929-16ec33faf9c1?q=80&w=800&auto=format&fit=crop",
    ctaText: "Acquista Ora",
    whatsappMessage: "Ciao! \xC8 ancora disponibile la Tastiera Meccanica Custom Sunset Glow (\u20AC189.00)? Ne vorrei ordinare una subito.",
    tags: ["Desk Setup", "Custom Tech", "Pochi Pezzi"],
    createdAt: "2026-06-24T11:00:00.000Z",
    expiresAt: "2026-06-25T23:59:59.000Z",
    // Expires in ~1.5 days
    clickCount: 42
  }
];
app.use(import_express.default.json({ limit: "100mb" }));
app.use(import_express.default.urlencoded({ limit: "100mb", extended: true }));
app.get("/api/posts", async (req, res) => {
  const posts = await readPosts();
  const now = /* @__PURE__ */ new Date();
  const activePosts = posts.filter((post) => {
    if (!post.expiresAt) return true;
    return new Date(post.expiresAt) > now;
  });
  activePosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(activePosts);
});
app.get("/api/all-posts", async (req, res) => {
  const posts = await readPosts();
  posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(posts);
});
app.post("/api/posts", async (req, res) => {
  const { title, price, description, mediaType, mediaUrl, ctaText, whatsappMessage, tags, expiresAt, overlayText, overlayX, overlayY } = req.body;
  if (!title || !mediaUrl) {
    return res.status(400).json({ error: "Titolo e URL media sono obbligatori." });
  }
  const posts = await readPosts();
  const newPost = {
    id: "post-" + Date.now(),
    title,
    price: price || void 0,
    description: description || void 0,
    mediaType: mediaType || "image",
    mediaUrl,
    ctaText: ctaText || "Ordina su WhatsApp",
    whatsappMessage: whatsappMessage || `Ciao! Vorrei ordinare ${title}.`,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    clickCount: 0,
    overlayText: overlayText || void 0,
    overlayX: typeof overlayX === "number" ? overlayX : void 0,
    overlayY: typeof overlayY === "number" ? overlayY : void 0
  };
  posts.push(newPost);
  await writePosts(posts);
  res.status(201).json(newPost);
});
app.put("/api/posts/:id", async (req, res) => {
  const { id } = req.params;
  const { title, price, description, mediaType, mediaUrl, ctaText, whatsappMessage, tags, expiresAt, overlayText, overlayX, overlayY } = req.body;
  const posts = await readPosts();
  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Post non trovato." });
  }
  const updatedPost = {
    ...posts[index],
    title: title ?? posts[index].title,
    price: price !== void 0 ? price : posts[index].price,
    description: description !== void 0 ? description : posts[index].description,
    mediaType: mediaType ?? posts[index].mediaType,
    mediaUrl: mediaUrl ?? posts[index].mediaUrl,
    ctaText: ctaText ?? posts[index].ctaText,
    whatsappMessage: whatsappMessage ?? posts[index].whatsappMessage,
    tags: Array.isArray(tags) ? tags : posts[index].tags,
    expiresAt: expiresAt !== void 0 ? expiresAt ? new Date(expiresAt).toISOString() : null : posts[index].expiresAt,
    overlayText: overlayText !== void 0 ? overlayText : posts[index].overlayText,
    overlayX: overlayX !== void 0 ? overlayX : posts[index].overlayX,
    overlayY: overlayY !== void 0 ? overlayY : posts[index].overlayY
  };
  posts[index] = updatedPost;
  await writePosts(posts);
  res.json(updatedPost);
});
app.post("/api/upload", async (req, res) => {
  try {
    const { filename, fileData, mimeType } = req.body;
    if (!filename || !fileData) {
      return res.status(400).json({ error: "Nome file e dati file (base64 o data URL) sono obbligatori." });
    }
    let buffer;
    if (fileData.startsWith("data:")) {
      buffer = Buffer.from(fileData.split(",")[1], "base64");
    } else {
      buffer = Buffer.from(fileData, "base64");
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const hasBlob = !!(token && !token.startsWith("vercel_blob_rw_..."));
    if (IS_VERCEL) {
      if (!hasBlob) {
        return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN non configurato su Vercel. Impossibile caricare file." });
      }
      const blob = await (0, import_blob.put)(filename, buffer, {
        access: "public",
        contentType: mimeType,
        addRandomSuffix: true,
        token
      });
      console.log(`[Upload] File caricato su Vercel Blob. URL: ${blob.url}`);
      return res.json({ url: blob.url });
    } else {
      const uploadsDir = import_path.default.join(process.cwd(), "assets", "uploads");
      if (!import_fs.default.existsSync(uploadsDir)) import_fs.default.mkdirSync(uploadsDir, { recursive: true });
      const ext = import_path.default.extname(filename) || "";
      const base = import_path.default.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
      const uniqueName = `${base}-${Date.now()}${ext}`;
      const filePath = import_path.default.join(uploadsDir, uniqueName);
      import_fs.default.writeFileSync(filePath, buffer);
      const fileUrl = `/assets/uploads/${uniqueName}`;
      console.log(`[Upload] File salvato in locale: ${filePath} \u2192 URL: ${fileUrl}`);
      if (hasBlob) {
        (0, import_blob.put)(`uploads/${uniqueName}`, buffer, { access: "public", contentType: mimeType, token }).then((b) => console.log(`[Upload] Sync Blob completato: ${b.url}`)).catch((err) => console.warn("[Upload] Sync Blob fallito (non critico):", err.message));
      }
      return res.json({ url: fileUrl });
    }
  } catch (err) {
    console.error("[Upload] Errore caricamento:", err);
    res.status(500).json({ error: "Errore durante il caricamento del file: " + err.message });
  }
});
app.get("/api/debug", async (req, res) => {
  let dbStatus = "no DATABASE_URL";
  let postCount = 0;
  if (hasDatabase) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT COUNT(*) as cnt FROM vs_posts`;
      postCount = Number(rows[0]?.cnt ?? 0);
      dbStatus = "connected";
    } catch (e) {
      dbStatus = "error: " + e.message;
    }
  }
  res.json({
    isVercel: !!process.env.VERCEL,
    hasDatabase,
    dbUrl: DB_URL ? DB_URL.replace(/:\/\/[^@]+@/, "://<credentials>@") : "(none)",
    dbStatus,
    postCount,
    nodeEnv: process.env.NODE_ENV,
    blobTokenPresent: !!process.env.BLOB_READ_WRITE_TOKEN
  });
});
app.post("/api/posts/clear-demo", async (req, res) => {
  try {
    const saved = await writePosts([]);
    if (!saved) {
      return res.status(500).json({ error: "Impossibile svuotare il DB. Verificare BLOB_READ_WRITE_TOKEN." });
    }
    console.log("[ClearDemo] DB post azzerato con successo.");
    res.json({ success: true, message: "Tutti i post demo eliminati. DB azzerato." });
  } catch (err) {
    res.status(500).json({ error: "Errore: " + err.message });
  }
});
app.post("/api/posts/reset-clicks", async (req, res) => {
  try {
    const posts = await readPosts();
    posts.forEach((p) => {
      p.clickCount = 0;
    });
    const saved = await writePosts(posts);
    if (!saved) {
      return res.status(500).json({ error: "Impossibile salvare le statistiche. Verificare la configurazione di BLOB_READ_WRITE_TOKEN su Vercel." });
    }
    res.json({ success: true, message: "Statistiche azzerate con successo." });
  } catch (err) {
    console.error("[Reset-Clicks] Errore:", err);
    res.status(500).json({ error: "Errore interno durante il reset delle statistiche: " + err.message });
  }
});
app.delete("/api/posts/:id", async (req, res) => {
  const { id } = req.params;
  const posts = await readPosts();
  const index = posts.findIndex((p) => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Post non trovato." });
  }
  const post = posts[index];
  if (post.mediaUrl && post.mediaUrl.includes("public.blob.vercel-storage.com")) {
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token && !token.startsWith("vercel_blob_rw_...")) {
        console.log(`[Delete-Post] Eliminazione del blob associato al post: ${post.mediaUrl}`);
        await (0, import_blob.del)(post.mediaUrl, { token });
      }
    } catch (err) {
      console.error("[Delete-Post] Errore durante l'eliminazione del blob dal Vercel Storage:", err);
    }
  }
  const filtered = posts.filter((p) => p.id !== id);
  const saved = await writePosts(filtered);
  if (!saved) {
    return res.status(500).json({
      error: "Impossibile salvare le modifiche. Verificare la configurazione di BLOB_READ_WRITE_TOKEN su Vercel."
    });
  }
  res.json({ success: true, message: "Post eliminato correttamente e blob rimosso se presente." });
});
app.post("/api/posts/:id/click", async (req, res) => {
  const { id } = req.params;
  const posts = await readPosts();
  const index = posts.findIndex((p) => p.id === id);
  if (index !== -1) {
    posts[index].clickCount = (posts[index].clickCount || 0) + 1;
    await writePosts(posts);
    return res.json({ success: true, clicks: posts[index].clickCount });
  }
  res.status(404).json({ error: "Post non trovato." });
});
app.get("/api/settings", async (req, res) => {
  const settings = await readSettings();
  res.json(settings);
});
app.post("/api/settings", async (req, res) => {
  const { whatsappNumber, streamTitle, streamSubtitle, notificationEmail } = req.body;
  const currentSettings = await readSettings();
  const updatedSettings = {
    whatsappNumber: whatsappNumber || currentSettings.whatsappNumber,
    streamTitle: streamTitle || currentSettings.streamTitle,
    streamSubtitle: streamSubtitle || currentSettings.streamSubtitle,
    notificationEmail: notificationEmail || currentSettings.notificationEmail || "castromassimo@gmail.com"
  };
  await writeSettings(updatedSettings);
  res.json(updatedSettings);
});
app.get("/api/bookings", async (req, res) => {
  await cleanupExpiredBookings();
  const bookings = await readBookings();
  bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(bookings);
});
app.delete("/api/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const bookings = await readBookings();
  const filtered = bookings.filter((b) => b.id !== id);
  if (bookings.length === filtered.length) {
    return res.status(404).json({ error: "Prenotazione non trovata." });
  }
  await writeBookings(filtered);
  res.json({ success: true, message: "Prenotazione eliminata." });
});
app.post("/api/bookings", async (req, res) => {
  const { postId, date, name, guests, phone } = req.body;
  if (!postId || !date || !name || !phone) {
    return res.status(400).json({ error: "Tutti i campi (Post, Data, Nome, Cellulare) sono obbligatori." });
  }
  const posts = await readPosts();
  const post = posts.find((p) => p.id === postId);
  const postTitle = post ? post.title : "Esperienza Sconosciuta";
  const bookings = await readBookings();
  const newBooking = {
    id: "booking-" + Date.now(),
    postId,
    postTitle,
    date,
    name,
    guests: guests ? parseInt(guests) : 1,
    phone,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  bookings.push(newBooking);
  await writeBookings(bookings);
  res.status(201).json({
    success: true,
    booking: newBooking
  });
});
async function start() {
  await initDb();
  const uploadsDir = import_path.default.join(process.cwd(), "assets", "uploads");
  if (!IS_VERCEL) {
    if (!import_fs.default.existsSync(uploadsDir)) import_fs.default.mkdirSync(uploadsDir, { recursive: true });
    app.use("/assets/uploads", import_express.default.static(uploadsDir));
  }
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
    console.log("Production static server configured.");
  }
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      cleanupExpiredBookings();
      setInterval(cleanupExpiredBookings, 6e4);
      console.log("[Auto-Cleanup] Servizio di pulizia automatica prenotazioni attivato (frequenza: 60s).");
      cleanupExpiredBlobs();
      setInterval(cleanupExpiredBlobs, 15 * 60 * 1e3);
      console.log("[Blob-Cleanup] Servizio di pulizia automatica blob attivato (frequenza: 15m).");
    });
  } else {
    cleanupExpiredBookings();
    setInterval(cleanupExpiredBookings, 6e4);
    cleanupExpiredBlobs();
    setInterval(cleanupExpiredBlobs, 15 * 60 * 1e3);
    console.log("[Vercel] Serverless functions started, cleanup intervals registered.");
  }
}
start().catch((err) => {
  console.error("Failed to start server:", err);
});
var server_default = app;
//# sourceMappingURL=server.cjs.map
