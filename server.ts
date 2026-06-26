import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { neon } from "@neondatabase/serverless";

dotenv.config();



const app = express();
const PORT = 3000;
const POSTS_FILE = path.join(process.cwd(), "posts.json");
const SETTINGS_FILE = path.join(process.cwd(), "settings.json");
const BOOKINGS_FILE = path.join(process.cwd(), "bookings.json");

// Define types
interface VisualStreamPost {
  id: string;
  title: string;
  price?: string;
  description?: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  ctaText?: string;
  whatsappMessage?: string;
  tags?: string[];
  createdAt: string;
  expiresAt?: string | null;
  clickCount: number;
  overlayText?: string;
  overlayX?: number;
  overlayY?: number;
}

interface CreatorSettings {
  whatsappNumber: string;
  streamTitle: string;
  streamSubtitle: string;
  notificationEmail?: string;
}

interface Booking {
  id: string;
  postId: string;
  postTitle: string;
  date: string;
  name: string;
  guests: number;
  phone: string;
  createdAt: string;
}

const DEFAULT_SETTINGS: CreatorSettings = {
  whatsappNumber: "393331234567",
  streamTitle: "Visual Stream",
  streamSubtitle: "Le migliori scoperte e novità esclusive selezionate questa settimana in anteprima assoluta.",
  notificationEmail: "castromassimo@gmail.com"
};

// ─── Neon PostgreSQL storage ──────────────────────────────────────────────────
// Uses DATABASE_URL / POSTGRES_URL (set automatically by Vercel when connecting Neon).
// Falls back to local JSON files when no database URL is configured (local dev).

const IS_VERCEL = !!process.env.VERCEL;
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
const hasDatabase = !!DB_URL;

function getDb() {
  if (!DB_URL) throw new Error("DATABASE_URL non configurato");
  return neon(DB_URL);
}

async function initDb() {
  if (!hasDatabase) {
    console.log("[DB] DATABASE_URL non trovato — uso file JSON locali.");
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

function rowToPost(row: any): VisualStreamPost {
  let tags: string[] = [];
  try { tags = JSON.parse(row.tags || "[]"); } catch { tags = []; }
  return {
    id: row.id,
    title: row.title,
    price: row.price ?? undefined,
    description: row.description ?? undefined,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    ctaText: row.cta_text ?? undefined,
    whatsappMessage: row.whatsapp_message ?? undefined,
    tags,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    expiresAt: row.expires_at ? (row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at)) : null,
    clickCount: row.click_count ?? 0,
    overlayText: row.overlay_text ?? undefined,
    overlayX: row.overlay_x !== null ? Number(row.overlay_x) : undefined,
    overlayY: row.overlay_y !== null ? Number(row.overlay_y) : undefined,
  };
}

function rowToBooking(row: any): Booking {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    date: row.date,
    name: row.name,
    guests: Number(row.guests),
    phone: row.phone,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

async function readPosts(): Promise<VisualStreamPost[]> {
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
    if (!fs.existsSync(POSTS_FILE)) {
      fs.writeFileSync(POSTS_FILE, JSON.stringify(INITIAL_POSTS, null, 2), "utf-8");
      return INITIAL_POSTS;
    }
    return JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
  } catch (error) {
    console.error("[ReadPosts] Errore file locale:", error);
    return INITIAL_POSTS;
  }
}

async function writePosts(posts: VisualStreamPost[]): Promise<boolean> {
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
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[WritePosts] Errore file locale:", error);
    return false;
  }
}

async function readSettings(): Promise<CreatorSettings> {
  if (hasDatabase) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT value FROM vs_settings WHERE key = 'main'`;
      if (rows.length > 0) {
        try { return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value) }; } catch { return DEFAULT_SETTINGS; }
      }
      return DEFAULT_SETTINGS;
    } catch (err) {
      console.error("[ReadSettings] Errore DB:", err);
      return DEFAULT_SETTINGS;
    }
  }
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) };
  } catch { return DEFAULT_SETTINGS; }
}

async function writeSettings(settings: CreatorSettings): Promise<boolean> {
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
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[WriteSettings] Errore file locale:", error);
    return false;
  }
}

async function readBookings(): Promise<Booking[]> {
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
    if (!fs.existsSync(BOOKINGS_FILE)) {
      fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf-8"));
  } catch (error) {
    console.error("[ReadBookings] Errore file locale:", error);
    return [];
  }
}

async function writeBookings(bookings: Booking[]): Promise<boolean> {
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
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[WriteBookings] Errore file locale:", error);
    return false;
  }
}

// Automatic cleanup for bookings
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
    const now = new Date();
    const active = bookings.filter(b => {
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

// Pre-seeded high-fidelity products
const INITIAL_POSTS: VisualStreamPost[] = [
  {
    id: "seeded-1",
    title: "Caffè Specialty Etiopia Yirgacheffe",
    price: "€18.50",
    description: "Note floreali di gelsomino, pesca bianca e un delicato retrogusto di miele agrumato. Raccolto a mano a 2.100 metri d'altezza, tostato fresco artigianalmente ogni martedì. Un'esperienza sensoriale pura per veri appassionati.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800&auto=format&fit=crop",
    ctaText: "Ordina via WhatsApp",
    whatsappMessage: "Ciao! Vorrei maggiori informazioni sul Caffè Specialty Etiopia Yirgacheffe (€18.50). È ancora disponibile per la spedizione?",
    tags: ["Specialty Coffee", "Edizione Limitata", "Tostatura Fresca"],
    createdAt: "2026-06-24T08:00:00.000Z",
    expiresAt: "2026-06-26T18:00:00.000Z", // Expires in ~2 days
    clickCount: 14
  },
  {
    id: "seeded-2",
    title: "Borsa Messenger in Pelle Artigianale",
    price: "€145.00",
    description: "Realizzata in pregiata pelle bovina conciata al vegetale in Toscana. Cuciture rinforzate in filo cerato, interni organizzati con scomparto imbottito per laptop fino a 14 pollici. Progettata per invecchiare con carattere.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop",
    ctaText: "Richiedi Disponibilità",
    whatsappMessage: "Ciao! Ho visto sul Visual Stream la Borsa Messenger in Pelle Artigianale (€145.00). Quali sono i tempi di consegna?",
    tags: ["Artigianato", "Vera Pelle", "Bestseller"],
    createdAt: "2026-06-23T10:00:00.000Z",
    expiresAt: null, // Persistent
    clickCount: 29
  },
  {
    id: "seeded-3",
    title: "Poltrona Lounge Minimale 'Nordic Slate'",
    price: "€320.00",
    description: "Linee pulite, struttura in legno massello di rovere cerato e rivestimento in tessuto bouclé color avorio ad alta resistenza. Progettata per offrire il massimo comfort ergonomico senza ingombrare visivamente il tuo spazio.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?q=80&w=800&auto=format&fit=crop",
    ctaText: "Prenota con Acconto",
    whatsappMessage: "Ciao! Vorrei pre-ordinare la Poltrona Lounge Minimale Nordic Slate (€320.00) vista nella vetrina. Mi spieghi come procedere?",
    tags: ["Design Interni", "Pre-Ordine", "Home Decor"],
    createdAt: "2026-06-22T15:30:00.000Z",
    expiresAt: "2026-06-29T20:00:00.000Z", // Expires in ~5 days
    clickCount: 8
  },
  {
    id: "seeded-4",
    title: "Tastiera Meccanica Custom 'Sunset Glow'",
    price: "€189.00",
    description: "Switch tattili personalizzati e lubrificati a mano per un suono profondo e ovattato. Keycaps PBT a sublimazione con gradiente tramonto, case in alluminio CNC anodizzato grigio siderale e retroilluminazione calda.",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1618384887929-16ec33faf9c1?q=80&w=800&auto=format&fit=crop",
    ctaText: "Acquista Ora",
    whatsappMessage: "Ciao! È ancora disponibile la Tastiera Meccanica Custom Sunset Glow (€189.00)? Ne vorrei ordinare una subito.",
    tags: ["Desk Setup", "Custom Tech", "Pochi Pezzi"],
    createdAt: "2026-06-24T11:00:00.000Z",
    expiresAt: "2026-06-25T23:59:59.000Z", // Expires in ~1.5 days
    clickCount: 42
  }
];

// Middleware for parsing JSON with increased limits to handle Base64 media uploads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// API: Get active posts (filter out expired ones on the client or server)
app.get("/api/posts", async (req, res) => {
  const posts = await readPosts();
  const now = new Date();
  
  // Filter active posts (unexpired, or unexpiration date is not set)
  const activePosts = posts.filter(post => {
    if (!post.expiresAt) return true;
    return new Date(post.expiresAt) > now;
  });
  
  // Sort by createdAt descending
  activePosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  res.json(activePosts);
});

// API: Get ALL posts (active and expired, for creator studio)
app.get("/api/all-posts", async (req, res) => {
  const posts = await readPosts();
  posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(posts);
});

// API: Create a new post
app.post("/api/posts", async (req, res) => {
  const { title, price, description, mediaType, mediaUrl, ctaText, whatsappMessage, tags, expiresAt, overlayText, overlayX, overlayY } = req.body;
  
  if (!title || !mediaUrl) {
    return res.status(400).json({ error: "Titolo e URL media sono obbligatori." });
  }
  
  const posts = await readPosts();
  
  const newPost: VisualStreamPost = {
    id: "post-" + Date.now(),
    title,
    price: price || undefined,
    description: description || undefined,
    mediaType: mediaType || "image",
    mediaUrl,
    ctaText: ctaText || "Ordina su WhatsApp",
    whatsappMessage: whatsappMessage || `Ciao! Vorrei ordinare ${title}.`,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    clickCount: 0,
    overlayText: overlayText || undefined,
    overlayX: typeof overlayX === "number" ? overlayX : undefined,
    overlayY: typeof overlayY === "number" ? overlayY : undefined
  };
  
  posts.push(newPost);
  await writePosts(posts);
  
  res.status(201).json(newPost);
});


// API: Update a post
app.put("/api/posts/:id", async (req, res) => {
  const { id } = req.params;
  const { title, price, description, mediaType, mediaUrl, ctaText, whatsappMessage, tags, expiresAt, overlayText, overlayX, overlayY } = req.body;
  
  const posts = await readPosts();
  const index = posts.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Post non trovato." });
  }
  
  const updatedPost: VisualStreamPost = {
    ...posts[index],
    title: title ?? posts[index].title,
    price: price !== undefined ? price : posts[index].price,
    description: description !== undefined ? description : posts[index].description,
    mediaType: mediaType ?? posts[index].mediaType,
    mediaUrl: mediaUrl ?? posts[index].mediaUrl,
    ctaText: ctaText ?? posts[index].ctaText,
    whatsappMessage: whatsappMessage ?? posts[index].whatsappMessage,
    tags: Array.isArray(tags) ? tags : posts[index].tags,
    expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt).toISOString() : null) : posts[index].expiresAt,
    overlayText: overlayText !== undefined ? overlayText : posts[index].overlayText,
    overlayX: overlayX !== undefined ? overlayX : posts[index].overlayX,
    overlayY: overlayY !== undefined ? overlayY : posts[index].overlayY
  };
  
  posts[index] = updatedPost;
  await writePosts(posts);
  
  res.json(updatedPost);
});

// API: Upload file — stores file locally in dev, returns data URL for Vercel (no Blob needed)
app.post("/api/upload", async (req, res) => {
  try {
    const { filename, fileData, mimeType } = req.body;
    if (!filename || !fileData) {
      return res.status(400).json({ error: "Nome file e dati file (base64 o data URL) sono obbligatori." });
    }

    // Normalize to data URL
    const dataUrl = fileData.startsWith("data:") ? fileData : `data:${mimeType || "application/octet-stream"};base64,${fileData}`;

    if (!IS_VERCEL) {
      // === LOCALHOST: save to local assets/uploads/ and serve statically ===
      const ext = path.extname(filename) || "";
      const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
      const uniqueName = `${base}-${Date.now()}${ext}`;
      const uploadsDir = path.join(process.cwd(), "assets", "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const base64Data = dataUrl.split(",")[1];
      fs.writeFileSync(path.join(uploadsDir, uniqueName), Buffer.from(base64Data, "base64"));
      console.log(`[Upload] File salvato: assets/uploads/${uniqueName}`);
      return res.json({ url: `/assets/uploads/${uniqueName}` });
    }

    // === VERCEL: return data URL directly — stored as media_url in Neon ===
    // The browser renders <img src="data:..."> natively. No external storage needed.
    console.log(`[Upload] File ricevuto (${Math.round(dataUrl.length / 1024)}KB) — restituito come data URL.`);
    return res.json({ url: dataUrl });

  } catch (err: any) {
    console.error("[Upload] Errore:", err);
    res.status(500).json({ error: "Errore durante il caricamento: " + err.message });
  }
});

// API: Debug endpoint — shows env status and DB connectivity
app.get("/api/debug", async (req, res) => {
  let dbStatus = "no DATABASE_URL";
  let postCount = 0;
  if (hasDatabase) {
    try {
      const sql = getDb();
      const rows = await sql`SELECT COUNT(*) as cnt FROM vs_posts`;
      postCount = Number(rows[0]?.cnt ?? 0);
      dbStatus = "connected";
    } catch (e: any) {
      dbStatus = "error: " + e.message;
    }
  }
  res.json({
    isVercel: !!process.env.VERCEL,
    hasDatabase,
    dbUrl: DB_URL ? DB_URL.replace(/:\/\/[^@]+@/, "://<credentials>@") : "(none)",
    dbStatus,
    postCount,
    nodeEnv: process.env.NODE_ENV
  });
});

// API: Clear all demo/seeded posts and reset the DB to empty
// IMPORTANT: declared BEFORE /:id routes
app.post("/api/posts/clear-demo", async (req, res) => {
  try {
    const saved = await writePosts([]);
    if (!saved) {
      return res.status(500).json({ error: "Impossibile svuotare il DB." });
    }
    console.log("[ClearDemo] DB post azzerato con successo.");
    res.json({ success: true, message: "Tutti i post demo eliminati. DB azzerato." });
  } catch (err: any) {
    res.status(500).json({ error: "Errore: " + err.message });
  }
});

// API: Reset all post click counts (statistics)
// IMPORTANT: This route must be declared BEFORE /api/posts/:id routes to avoid Express
// treating 'reset-clicks' as a dynamic :id parameter.
app.post("/api/posts/reset-clicks", async (req, res) => {
  try {
    const posts = await readPosts();
    posts.forEach(p => {
      p.clickCount = 0;
    });
    const saved = await writePosts(posts);
    if (!saved) {
      return res.status(500).json({ error: "Impossibile salvare le statistiche." });
    }
    res.json({ success: true, message: "Statistiche azzerate con successo." });
  } catch (err: any) {
    console.error("[Reset-Clicks] Errore:", err);
    res.status(500).json({ error: "Errore interno durante il reset delle statistiche: " + err.message });
  }
});

// API: Delete a post
app.delete("/api/posts/:id", async (req, res) => {
  const { id } = req.params;
  const posts = await readPosts();
  const index = posts.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Post non trovato." });
  }

  const filtered = posts.filter(p => p.id !== id);

  const saved = await writePosts(filtered);
  if (!saved) {
    return res.status(500).json({ error: "Impossibile eliminare il post dal database." });
  }
  res.json({ success: true, message: "Post eliminato correttamente." });
});


// API: Track CTA click
app.post("/api/posts/:id/click", async (req, res) => {
  const { id } = req.params;
  const posts = await readPosts();
  const index = posts.findIndex(p => p.id === id);
  
  if (index !== -1) {
    posts[index].clickCount = (posts[index].clickCount || 0) + 1;
    await writePosts(posts);
    return res.json({ success: true, clicks: posts[index].clickCount });
  }
  
  res.status(404).json({ error: "Post non trovato." });
});

// API: Get settings
app.get("/api/settings", async (req, res) => {
  const settings = await readSettings();
  res.json(settings);
});

// API: Save settings
app.post("/api/settings", async (req, res) => {
  const { whatsappNumber, streamTitle, streamSubtitle, notificationEmail } = req.body;
  const currentSettings = await readSettings();
  
  const updatedSettings: CreatorSettings = {
    whatsappNumber: whatsappNumber || currentSettings.whatsappNumber,
    streamTitle: streamTitle || currentSettings.streamTitle,
    streamSubtitle: streamSubtitle || currentSettings.streamSubtitle,
    notificationEmail: notificationEmail || currentSettings.notificationEmail || "castromassimo@gmail.com"
  };
  
  await writeSettings(updatedSettings);
  res.json(updatedSettings);
});

// API: Get all bookings
app.get("/api/bookings", async (req, res) => {
  await cleanupExpiredBookings();
  const bookings = await readBookings();
  // Sort descending by creation date
  bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(bookings);
});

// API: Delete a booking
app.delete("/api/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const bookings = await readBookings();
  const filtered = bookings.filter(b => b.id !== id);
  
  if (bookings.length === filtered.length) {
    return res.status(404).json({ error: "Prenotazione non trovata." });
  }
  
  await writeBookings(filtered);
  res.json({ success: true, message: "Prenotazione eliminata." });
});

// Email sending helper
async function sendReservationEmail(booking: Booking, targetEmail: string) {
  const mailContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #fcfcfc;">
      <h2 style="color: #10b981; margin-top: 0;">Nuova Prenotazione Ricevuta!</h2>
      <p>Hai ricevuto una nuova prenotazione automatica dal tuo Visual Stream:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f3f4f6;">
          <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Dettaglio</th>
          <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Valore</th>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Esperienza / Post</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${booking.postTitle}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Data Prenotata</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; color: #0284c7; font-weight: bold;">${booking.date}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Nome Cliente</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${booking.name}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Numero Persone</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${booking.guests}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Cellulare</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${booking.phone}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Ricevuto il</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${new Date(booking.createdAt).toLocaleString("it-IT")}</td>
        </tr>
      </table>
      
      <p style="font-size: 14px; color: #6b7280; border-top: 1px solid #eee; padding-top: 15px;">
        Questo è un messaggio automatico inviato dal tuo portale Visual Stream. Contatta subito il cliente per confermare l'evento.
      </p>
    </div>
  `;

  const textContent = `
Nuova Prenotazione Ricevuta!
Esperienza/Post: ${booking.postTitle}
Data Prenotata: ${booking.date}
Nome: ${booking.name}
Persone: ${booking.guests}
Cellulare: ${booking.phone}
  `;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    console.log(`[SMTP] Inoltro email reale a ${targetEmail} via ${host}...`);
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      });

      await transporter.sendMail({
        from: `"Visual Stream Booking" <${user}>`,
        to: targetEmail,
        subject: `Nuova Prenotazione: ${booking.postTitle} - ${booking.name}`,
        text: textContent,
        html: mailContent
      });
      console.log(`[SMTP] Email inviata con successo!`);
      return { sent: true, method: "smtp" };
    } catch (smtpErr) {
      console.error("[SMTP Error] Errore nell'invio reale. Eseguo simulazione di backup.", smtpErr);
    }
  }

  // Elegant simulation if SMTP is missing or failed
  const simulatedLog = `
=========================================
[SIMULAZIONE INVIO EMAIL AUTOMATICA]
Inviato a: ${targetEmail}
Oggetto: Nuova Prenotazione: ${booking.postTitle} - ${booking.name}
Corpo Messaggio:
- Esperienza/Post: ${booking.postTitle}
- Data Prenotata: ${booking.date}
- Nome: ${booking.name}
- Persone: ${booking.guests}
- Cellulare: ${booking.phone}
=========================================
  `;
  console.log(simulatedLog);
  return { sent: true, method: "simulated" };
}

// API: Create a booking
app.post("/api/bookings", async (req, res) => {
  const { postId, date, name, guests, phone } = req.body;
  
  if (!postId || !date || !name || !phone) {
    return res.status(400).json({ error: "Tutti i campi (Post, Data, Nome, Cellulare) sono obbligatori." });
  }
  
  // Find post details to include the title
  const posts = await readPosts();
  const post = posts.find(p => p.id === postId);
  const postTitle = post ? post.title : "Esperienza Sconosciuta";
  
  const bookings = await readBookings();
  const newBooking: Booking = {
    id: "booking-" + Date.now(),
    postId,
    postTitle,
    date,
    name,
    guests: guests ? parseInt(guests) : 1,
    phone,
    createdAt: new Date().toISOString()
  };
  
  bookings.push(newBooking);
  await writeBookings(bookings);
  
  res.status(201).json({
    success: true,
    booking: newBooking
  });
});





// Configure Vite middleware or serve static assets
async function start() {
  await initDb();

  // Serve locally-uploaded files at /assets/uploads/* (dev only, Vercel uses Blob URLs)
  const uploadsDir = path.join(process.cwd(), "assets", "uploads");
  if (!IS_VERCEL) {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    app.use("/assets/uploads", express.static(uploadsDir));
  }

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");

  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static server configured.");
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      
      // Perform initial cleanup and start 1-minute interval for automatic deletions
      cleanupExpiredBookings();
      setInterval(cleanupExpiredBookings, 60000);
      console.log("[Auto-Cleanup] Servizio di pulizia automatica prenotazioni attivato (frequenza: 60s).");
      
      // Perform initial Vercel Blob cleanup and start 15-minute interval for automatic deletions
      cleanupExpiredBlobs();
      setInterval(cleanupExpiredBlobs, 15 * 60 * 1000);
      console.log("[Blob-Cleanup] Servizio di pulizia automatica blob attivato (frequenza: 15m).");
    });
  } else {
    // Initialize cleanup tasks on Vercel startup (note: serverless environments have ephemeral execution,
    // so scheduling checks on request or using Vercel Cron is recommended, but we keep the intervals for compatibility)
    cleanupExpiredBookings();
    setInterval(cleanupExpiredBookings, 60000);
    cleanupExpiredBlobs();
    setInterval(cleanupExpiredBlobs, 15 * 60 * 1000);
    console.log("[Vercel] Serverless functions started, cleanup intervals registered.");
  }
}

start().catch(err => {
  console.error("Failed to start server:", err);
});

export default app;
