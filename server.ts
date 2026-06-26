import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { put, del, list } from "@vercel/blob";

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

async function readSettings(): Promise<CreatorSettings> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && !token.startsWith("vercel_blob_rw_...")) {
      const { blobs } = await list({ prefix: "db/settings.json", token });
      const dbBlob = blobs.find(b => b.pathname === "db/settings.json");
      if (dbBlob) {
        const response = await fetch(dbBlob.url);
        if (response.ok) {
          const parsed = await response.json();
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
      }
    }
  } catch (err) {
    console.error("Error reading settings from Vercel Blob:", err);
  }

  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
      return DEFAULT_SETTINGS;
    }
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    console.error("Error reading settings file:", error);
    return DEFAULT_SETTINGS;
  }
}

async function writeSettings(settings: CreatorSettings) {
  const dataStr = JSON.stringify(settings, null, 2);
  try {
    fs.writeFileSync(SETTINGS_FILE, dataStr, "utf-8");
  } catch (error) {
    console.warn("Could not write settings file locally:", error);
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && !token.startsWith("vercel_blob_rw_...")) {
      await put("db/settings.json", dataStr, {
        access: "public",
        addRandomSuffix: false,
        token
      });
      console.log("[Blob-DB] Settings salvati con successo su Vercel Blob.");
    }
  } catch (err) {
    console.error("Error writing settings to Vercel Blob:", err);
  }
}

async function readBookings(): Promise<Booking[]> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && !token.startsWith("vercel_blob_rw_...")) {
      const { blobs } = await list({ prefix: "db/bookings.json", token });
      const dbBlob = blobs.find(b => b.pathname === "db/bookings.json");
      if (dbBlob) {
        const response = await fetch(dbBlob.url);
        if (response.ok) {
          return await response.json();
        }
      }
    }
  } catch (err) {
    console.error("Error reading bookings from Vercel Blob:", err);
  }

  try {
    if (!fs.existsSync(BOOKINGS_FILE)) {
      fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    const data = fs.readFileSync(BOOKINGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading bookings file:", error);
    return [];
  }
}

async function writeBookings(bookings: Booking[]) {
  const dataStr = JSON.stringify(bookings, null, 2);
  try {
    fs.writeFileSync(BOOKINGS_FILE, dataStr, "utf-8");
  } catch (error) {
    console.warn("Could not write bookings file locally:", error);
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && !token.startsWith("vercel_blob_rw_...")) {
      await put("db/bookings.json", dataStr, {
        access: "public",
        addRandomSuffix: false,
        token
      });
      console.log("[Blob-DB] Bookings salvati con successo su Vercel Blob.");
    }
  } catch (err) {
    console.error("Error writing bookings to Vercel Blob:", err);
  }
}


// Automatic cleanup for bookings
// A booking for e.g. July 4th is deleted at 00:00:00 (midnight) of July 5th.
async function cleanupExpiredBookings() {
  try {
    const bookings = await readBookings();
    const now = new Date();
    
    const activeBookings = bookings.filter(booking => {
      if (!booking.date) return true; // Keep if no valid date
      
      const [year, month, day] = booking.date.split("-").map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return true;
      
      // Expiration date: Day after the booking at midnight (00:00:00)
      // Javascript's Date constructor handles day overflow correctly (e.g., July 31st + 1 becomes August 1st)
      const expirationDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
      
      // Keep if current time is BEFORE the expiration time
      return now.getTime() < expirationDate.getTime();
    });
    
    if (activeBookings.length !== bookings.length) {
      console.log(`[Auto-Cleanup] Rimossi ${bookings.length - activeBookings.length} prenotazioni scadute (oltre la mezzanotte del giorno successivo).`);
      await writeBookings(activeBookings);
    }
  } catch (err) {
    console.error("[Auto-Cleanup] Errore durante la pulizia automatica delle prenotazioni:", err);
  }
}


// Background job to clean up blobs older than 48 hours
async function cleanupExpiredBlobs() {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token || token.startsWith("vercel_blob_rw_...")) {
      console.log("[Blob-Cleanup] BLOB_READ_WRITE_TOKEN non configurato o non valido. Salto la pulizia dei blob.");
      return;
    }

    console.log("[Blob-Cleanup] Avvio della pulizia automatica dei blob...");
    const { blobs } = await list({ token });
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    let deletedCount = 0;
    const posts = readPosts();
    let postsChanged = false;

    for (const blob of blobs) {
      const uploadedAt = new Date(blob.uploadedAt);
      if (uploadedAt < fortyEightHoursAgo) {
        console.log(`[Blob-Cleanup] Rilevato blob scaduto (>48h): ${blob.url} (caricato il: ${blob.uploadedAt})`);
        try {
          await del(blob.url, { token });
          deletedCount++;

          // Remove the post referencing this blob (or we can just keep the post but set mediaUrl empty/delete it)
          // The instruction says "dopo 48 ore elimina il file archiviato in automatico, no tutti i file solo quello archiviato 48 ore prima."
          // Deleting the post entirely is cleaner since without the file the post has no media.
          const postIndex = posts.findIndex(p => p.mediaUrl === blob.url);
          if (postIndex !== -1) {
            console.log(`[Blob-Cleanup] Rimozione del post '${posts[postIndex].title}' (${posts[postIndex].id}) associato al blob eliminato.`);
            posts.splice(postIndex, 1);
            postsChanged = true;
          }
        } catch (delErr) {
          console.error(`[Blob-Cleanup] Errore durante l'eliminazione del blob ${blob.url}:`, delErr);
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`[Blob-Cleanup] Rimossi con successo ${deletedCount} blob scaduti.`);
    } else {
      console.log("[Blob-Cleanup] Nessun blob scaduto rilevato.");
    }

    if (postsChanged) {
      writePosts(posts);
    }
  } catch (error) {
    console.error("[Blob-Cleanup] Errore durante la pulizia automatica dei blob:", error);
  }
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

// Helper to read posts from Vercel Blob (or fallback to local file)
async function readPosts(): Promise<VisualStreamPost[]> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && !token.startsWith("vercel_blob_rw_...")) {
      const { blobs } = await list({ prefix: "db/posts.json", token });
      const dbBlob = blobs.find(b => b.pathname === "db/posts.json");
      if (dbBlob) {
        const response = await fetch(dbBlob.url);
        if (response.ok) {
          return await response.json();
        }
      }
    }
  } catch (err) {
    console.error("Error reading posts from Vercel Blob, falling back to local:", err);
  }

  try {
    if (!fs.existsSync(POSTS_FILE)) {
      fs.writeFileSync(POSTS_FILE, JSON.stringify(INITIAL_POSTS, null, 2), "utf-8");
      return INITIAL_POSTS;
    }
    const data = fs.readFileSync(POSTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading posts file:", error);
    return INITIAL_POSTS;
  }
}

async function writePosts(posts: VisualStreamPost[]) {
  const dataStr = JSON.stringify(posts, null, 2);
  try {
    fs.writeFileSync(POSTS_FILE, dataStr, "utf-8");
  } catch (error) {
    console.warn("Could not write posts file locally:", error);
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && !token.startsWith("vercel_blob_rw_...")) {
      await put("db/posts.json", dataStr, {
        access: "public",
        addRandomSuffix: false, // overwrite
        token
      });
      console.log("[Blob-DB] Posts salvati con successo su Vercel Blob.");
    }
  } catch (err) {
    console.error("Error writing posts to Vercel Blob:", err);
  }
}




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

// API: Upload file to Vercel Blob
app.post("/api/upload", async (req, res) => {
  try {
    const { filename, fileData, mimeType } = req.body;
    if (!filename || !fileData) {
      return res.status(400).json({ error: "Nome file e dati file (base64 o data URL) sono obbligatori." });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token || token.startsWith("vercel_blob_rw_...")) {
      return res.status(500).json({ 
        error: "BLOB_READ_WRITE_TOKEN non configurato nel file .env. Impossibile caricare su Vercel Blob." 
      });
    }

    // Convert Base64 back to buffer
    let buffer: Buffer;
    if (fileData.startsWith("data:")) {
      const base64Data = fileData.split(",")[1];
      buffer = Buffer.from(base64Data, "base64");
    } else {
      buffer = Buffer.from(fileData, "base64");
    }

    console.log(`[Upload] Caricamento file ${filename} (${buffer.length} byte) su Vercel Blob...`);

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: true, // Allow uploading identical files by generating unique names
      token
    });

    console.log(`[Upload] File caricato con successo. URL: ${blob.url}`);
    res.json({ url: blob.url });
  } catch (err: any) {
    console.error("[Upload] Errore durante il caricamento su Vercel Blob:", err);
    res.status(500).json({ error: "Errore durante il caricamento del file: " + err.message });
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

  const post = posts[index];
  
  // If it's a Vercel Blob URL, delete it from Vercel Blob immediately
  if (post.mediaUrl && post.mediaUrl.includes("public.blob.vercel-storage.com")) {
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token && !token.startsWith("vercel_blob_rw_...")) {
        console.log(`[Delete-Post] Eliminazione del blob associato al post: ${post.mediaUrl}`);
        await del(post.mediaUrl, { token });
      }
    } catch (err) {
      console.error("[Delete-Post] Errore durante l'eliminazione del blob dal Vercel Storage:", err);
    }
  }

  const filtered = posts.filter(p => p.id !== id);

  await writePosts(filtered);
  res.json({ success: true, message: "Post eliminato correttamente e blob rimosso se presente." });
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
