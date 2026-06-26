import React, { useState, useEffect, useRef } from "react";
import { VisualStreamPost, CreatorSettings } from "../types";
import { getPostDefaultName, formatBookingDateOnly, getBookingDayKey, formatBookingDayHeader, parseBookingDate } from "../utils";
import { 
  Lock, ArrowLeft, Plus, Trash2, Edit2, BarChart2, MessageSquare, 
  Settings as SettingsIcon, Sparkles, Check, Copy, Calendar, 
  Eye, RefreshCw, Smartphone, DollarSign, Clock, Play
} from "lucide-react";

interface CreatorStudioProps {
  onClose: () => void;
  posts: VisualStreamPost[];
  onRefreshPosts: () => void;
  settings: CreatorSettings;
  onSaveSettings: (newSettings: CreatorSettings) => void;
}

export default function CreatorStudio({ 
  onClose, posts, onRefreshPosts, settings, onSaveSettings 
}: CreatorStudioProps) {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pin, setPin] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");
  const correctPin = "1234";

  // Navigation State inside Creator Studio
  const [activeTab, setActiveTab] = useState<"dashboard" | "add-post" | "bookings" | "settings">("dashboard");

  // Form State for Adding / Editing Post
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [ctaText, setCtaText] = useState("Ordina su WhatsApp");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [expiresIn, setExpiresIn] = useState("null"); // "null", "1d", "3d", "7d", "14d", "custom"
  const [customExpiry, setCustomExpiry] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [overlayText, setOverlayText] = useState("");
  const [overlayX, setOverlayX] = useState<number>(10);
  const [overlayY, setOverlayY] = useState<number>(20);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // File selection & load as Base64 Data URL, then upload to Vercel Blob
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFormError("");

    // Auto-detect mediaType based on file MIME type
    if (file.type.startsWith("video/")) {
      setMediaType("video");
    } else {
      setMediaType("image");
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const base64Url = event.target.result as string;
        try {
          const response = await fetch("/api/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filename: file.name,
              fileData: base64Url,
              mimeType: file.type
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Errore nel caricamento del file.");
          }

          const data = await response.json();
          setMediaUrl(data.url);
        } catch (err: any) {
          console.error("Errore durante l'upload:", err);
          setFormError(err.message || "Errore di connessione durante il caricamento del file.");
          setMediaUrl("");
        } finally {
          setIsUploading(false);
        }
      }
    };

    reader.onerror = () => {
      setFormError("Errore nella lettura del file locale.");
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  };


  // Drag handlers for overlay positioning
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMove = (e: MouseEvent) => {
        if (!previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();
        let xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        let yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        xPercent = Math.max(2, Math.min(xPercent, 80));
        yPercent = Math.max(2, Math.min(yPercent, 92));
        setOverlayX(Math.round(xPercent));
        setOverlayY(Math.round(yPercent));
      };

      const handleGlobalTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 0 || !previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        let xPercent = ((touch.clientX - rect.left) / rect.width) * 100;
        let yPercent = ((touch.clientY - rect.top) / rect.height) * 100;
        xPercent = Math.max(2, Math.min(xPercent, 80));
        yPercent = Math.max(2, Math.min(yPercent, 92));
        setOverlayX(Math.round(xPercent));
        setOverlayY(Math.round(yPercent));
      };

      const handleGlobalUp = () => {
        setIsDragging(false);
      };

      window.addEventListener("mousemove", handleGlobalMove);
      window.addEventListener("mouseup", handleGlobalUp);
      window.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
      window.addEventListener("touchend", handleGlobalUp);

      return () => {
        window.removeEventListener("mousemove", handleGlobalMove);
        window.removeEventListener("mouseup", handleGlobalUp);
        window.removeEventListener("touchmove", handleGlobalTouchMove);
        window.removeEventListener("touchend", handleGlobalUp);
      };
    }
  }, [isDragging]);

  // Settings local state
  const [localPhone, setLocalPhone] = useState(settings.whatsappNumber);
  const [localTitle, setLocalTitle] = useState(settings.streamTitle);
  const [localSubtitle, setLocalSubtitle] = useState(settings.streamSubtitle);
  const [localEmail, setLocalEmail] = useState(settings.notificationEmail || "castromassimo@gmail.com");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Bookings list state
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState<boolean>(false);
  const [bookingSortOrder, setBookingSortOrder] = useState<"asc" | "desc">("asc");
  const [bookingDayFilter, setBookingDayFilter] = useState<string>("all");

  // Fetch all bookings from server
  const fetchBookings = async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (e) {
      console.error("Error loading bookings:", e);
    } finally {
      setLoadingBookings(false);
    }
  };

  // Delete a booking
  const handleDeleteBooking = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa prenotazione?")) return;
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBookings(bookings.filter(b => b.id !== id));
      } else {
        alert("Errore nell'eliminazione della prenotazione.");
      }
    } catch (e) {
      console.error(e);
      alert("Errore di rete.");
    }
  };

  // Fetch bookings when active tab is 'bookings'
  useEffect(() => {
    if (activeTab === "bookings") {
      fetchBookings();
    }
  }, [activeTab]);

  // Quick vertical video and image presets (1080x1920 style)
  const MEDIA_PRESETS = [
    { name: "🎬 Video Moda Minimal", type: "video" as const, url: "https://player.vimeo.com/external/371433846.sd.mp4?s=236da2f3cceeec327aa497da96df201416e788bc&profile_id=165&oauth2_token_id=57447761" },
    { name: "🎬 Video Caffè Pour", type: "video" as const, url: "https://player.vimeo.com/external/434045526.sd.mp4?s=c13149852fec2e50d53c5f49ef25bf8f47055c51&profile_id=165&oauth2_token_id=57447761" },
    { name: "🎬 Video Phone Scroll", type: "video" as const, url: "https://player.vimeo.com/external/485641861.sd.mp4?s=bc9954d3df24cf8f2be05fa9723ec0e318182be0&profile_id=165&oauth2_token_id=57447761" },
    { name: "📸 Sneaker 9:16", type: "image" as const, url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=1080&h=1920" },
    { name: "📸 Sedia Loft 9:16", type: "image" as const, url: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=1080&h=1920" },
    { name: "📸 Zaino Tech 9:16", type: "image" as const, url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=1080&h=1920" },
    { name: "📸 Lampada Zen 9:16", type: "image" as const, url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=1080&h=1920" }
  ];

  // Auto-fill WhatsApp template message when Title changes
  useEffect(() => {
    if (title && !editingPostId) {
      setWhatsappMessage(
        `Ciao! Ho visto nel Visual Stream l'articolo "${title}" ${price ? `a ${price}` : ''}. Vorrei maggiori dettagli su come riceverlo. Grazie!`
      );
    }
  }, [title, price, editingPostId]);

  // Handle PIN Unlock
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      setIsAuthenticated(true);
      setPinError("");
    } else {
      setPinError("PIN non valido. Riprova. (Suggerimento: 1234)");
      setPin("");
    }
  };

  const handlePinKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin(pin + num);
    }
  };

  const handlePinDelete = () => {
    setPin(pin.slice(0, -1));
  };

  // Stats calculators
  const now = new Date();
  const activePosts = posts.filter(p => !p.expiresAt || new Date(p.expiresAt) > now);
  const expiredPosts = posts.filter(p => p.expiresAt && new Date(p.expiresAt) <= now);
  const totalClicks = posts.reduce((acc, curr) => acc + (curr.clickCount || 0), 0);
  const topProduct = posts.length > 0 ? [...posts].sort((a,b) => b.clickCount - a.clickCount)[0] : null;

  // Handle Create / Update Submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-generate title if not editing, or keep existing if editing
    const submitTitle = editingPostId ? title : `Post ${posts.length + 1}`;
    
    if (!mediaUrl.trim()) {
      setFormError("L'URL del media o il file caricato è obbligatorio.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    // Calculate expiration ISO date
    let expiresAt: string | null = null;
    const expiryNow = new Date();
    if (expiresIn === "1d") {
      expiryNow.setDate(expiryNow.getDate() + 1);
      expiresAt = expiryNow.toISOString();
    } else if (expiresIn === "3d") {
      expiryNow.setDate(expiryNow.getDate() + 3);
      expiresAt = expiryNow.toISOString();
    } else if (expiresIn === "7d") {
      expiryNow.setDate(expiryNow.getDate() + 7);
      expiresAt = expiryNow.toISOString();
    } else if (expiresIn === "14d") {
      expiryNow.setDate(expiryNow.getDate() + 14);
      expiresAt = expiryNow.toISOString();
    } else if (expiresIn === "custom" && customExpiry) {
      expiresAt = new Date(customExpiry).toISOString();
    }

    const payload = {
      title: submitTitle,
      price: null, // Price removed entirely
      description: description || "",
      mediaType,
      mediaUrl,
      ctaText,
      whatsappMessage: whatsappMessage || `Ciao! Vorrei prenotare l'esperienza ${submitTitle}.`,
      tags: tagsInput.split(",").map(t => t.trim()).filter(t => t.length > 0),
      expiresAt,
      overlayText: overlayText || undefined,
      overlayX,
      overlayY
    };

    try {
      let res;
      if (editingPostId) {
        res = await fetch(`/api/posts/${editingPostId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        // Reset form
        resetForm();
        onRefreshPosts();
        setActiveTab("dashboard");
      } else {
        const err = await res.json();
        setFormError(err.error || "Qualcosa è andato storto.");
      }
    } catch (err) {
      console.error(err);
      setFormError("Errore di connessione al server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingPostId(null);
    setTitle("");
    setPrice("");
    setDescription("");
    setMediaType("image");
    setMediaUrl("");
    setCtaText("Ordina su WhatsApp");
    setWhatsappMessage("");
    setTagsInput("");
    setExpiresIn("null");
    setCustomExpiry("");
    setFormError("");
    setOverlayText("");
    setOverlayX(10);
    setOverlayY(20);
  };

  const handleEditClick = (post: VisualStreamPost) => {
    setEditingPostId(post.id);
    setTitle(post.title);
    setPrice(post.price || "");
    setDescription(post.description || "");
    setMediaType(post.mediaType);
    setMediaUrl(post.mediaUrl);
    setCtaText(post.ctaText || "Ordina su WhatsApp");
    setWhatsappMessage(post.whatsappMessage || "");
    setTagsInput((post.tags || []).join(", "));
    setOverlayText(post.overlayText || "");
    setOverlayX(post.overlayX ?? 10);
    setOverlayY(post.overlayY ?? 20);
    
    if (!post.expiresAt) {
      setExpiresIn("null");
    } else {
      setExpiresIn("custom");
      setCustomExpiry(new Date(post.expiresAt).toISOString().slice(0, 16));
    }
    
    setActiveTab("add-post");
  };

  const handleDeleteClick = async (id: string) => {
    if (!window.confirm("Sei sicuro di voler eliminare definitivamente questo post?")) {
      return;
    }

    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        onRefreshPosts();
      }
    } catch (err) {
      console.error("Errore eliminazione post:", err);
    }
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      whatsappNumber: localPhone,
      streamTitle: localTitle,
      streamSubtitle: localSubtitle,
      notificationEmail: localEmail
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  // PIN Unlock Layout (Minimal Elegance)
  if (!isAuthenticated) {
    return (
      <div 
        id="pin-unlock-screen"
        className="fixed inset-0 z-50 bg-zinc-950 flex flex-col justify-center items-center px-6"
      >
        <button 
          id="exit-pin-screen"
          onClick={onClose}
          className="absolute top-6 left-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Chiudi</span>
        </button>

        <div className="w-full max-w-sm flex flex-col items-center space-y-10">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-zinc-100 tracking-tight">Accesso Autore</h2>
            <p className="text-xs text-zinc-500">Inserisci il PIN di sblocco per accedere alla plancia</p>
          </div>

          <form onSubmit={handlePinSubmit} className="w-full space-y-6">
            {/* Visual Indicator of Entered Characters */}
            <div className="flex justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((idx) => (
                <div 
                  key={idx} 
                  className={`w-4.5 h-4.5 rounded-full border transition-all duration-200 ${
                    pin.length > idx 
                      ? "bg-fuchsia-400 border-fuchsia-400 scale-110 shadow-sm shadow-fuchsia-400/50" 
                      : "bg-transparent border-zinc-800"
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-center text-xs text-rose-400 font-medium">{pinError}</p>
            )}

            {/* Custom Interactive Minimal Grid Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-[270px] mx-auto">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  id={`keypad-btn-${num}`}
                  key={num}
                  type="button"
                  onClick={() => handlePinKeyPress(num)}
                  className="w-16 h-16 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-bold text-xl flex items-center justify-center border border-zinc-900/40 hover:border-zinc-800 active:scale-90 transition-all cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                id="keypad-btn-clear"
                type="button"
                onClick={() => setPin("")}
                className="w-16 h-16 rounded-full bg-zinc-950 text-zinc-500 text-xs font-bold uppercase flex items-center justify-center hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Canc
              </button>
              <button
                id="keypad-btn-0"
                type="button"
                onClick={() => handlePinKeyPress("0")}
                className="w-16 h-16 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-bold text-xl flex items-center justify-center border border-zinc-900/40 active:scale-90 transition-all cursor-pointer"
              >
                0
              </button>
              <button
                id="keypad-btn-del"
                type="button"
                onClick={handlePinDelete}
                className="w-16 h-16 rounded-full bg-zinc-950 text-zinc-500 text-xs font-bold uppercase flex items-center justify-center hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Elim
              </button>
            </div>

            <button
              id="submit-pin"
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.01] active:scale-95 transition-all cursor-pointer mt-4"
            >
              Sblocca Plancia
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleCopyStreamUrl = () => {
    // Construct the clean home page link (stripping any query params/hashes, keeping just origin and basic pathname)
    let homeUrl = window.location.origin + window.location.pathname;
    if (homeUrl.endsWith("/index.html")) {
      homeUrl = homeUrl.replace("/index.html", "");
    }
    // ensure no trailing slash unless it's just the root
    if (homeUrl.length > window.location.origin.length && homeUrl.endsWith("/")) {
      homeUrl = homeUrl.slice(0, -1);
    }

    const performCopy = (text: string) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            setUrlCopied(true);
            setTimeout(() => setUrlCopied(false), 2000);
          })
          .catch((err) => {
            console.error("Failed to copy with navigator.clipboard:", err);
            fallbackCopyText(text);
          });
      } else {
        fallbackCopyText(text);
      }
    };

    const fallbackCopyText = (text: string) => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (successful) {
          setUrlCopied(true);
          setTimeout(() => setUrlCopied(false), 2000);
        } else {
          prompt("Copia il link qui sotto:", text);
        }
      } catch (err) {
        console.error("Fallback copy failed:", err);
        prompt("Copia il link qui sotto:", text);
      }
    };

    performCopy(homeUrl);
  };

  // Authenticated Dashboard Layout
  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Creator Top Navbar Header */}
      <div className="w-full bg-zinc-900 border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button 
            id="back-to-stream"
            onClick={onClose}
            className="flex items-center justify-center p-2 rounded-xl border border-zinc-800 border-b-[3px] border-b-zinc-950 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 active:translate-y-[1px] active:border-b-[1.5px] shadow-sm transition-all cursor-pointer shrink-0"
            title="Torna allo stream"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="truncate flex flex-col justify-center">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-fuchsia-500/80 leading-none mb-0.5">Area Creator</span>
            <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-100 truncate leading-none">Creator Studio</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="copy-stream-link"
            onClick={handleCopyStreamUrl}
            className={`py-2 px-2.5 sm:px-3.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
              urlCopied 
                ? "bg-emerald-500 text-zinc-950 border-emerald-400 border-b-[3px] border-b-emerald-700 font-black shadow-md" 
                : "border-zinc-800 border-b-[3px] border-b-zinc-950 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-850 active:translate-y-[1px] active:border-b-[1.5px]"
            }`}
            title="Copia link per condivisione WhatsApp"
          >
            {urlCopied ? <Check className="w-3.5 h-3.5 text-zinc-950 animate-pulse" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{urlCopied ? "Copiato!" : "Copia Link"}</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation Rail */}
      <div className="w-full border-b border-zinc-900/80 bg-zinc-950 p-2 flex overflow-x-auto gap-2 scrollbar-none shrink-0">
        <button
          id="tab-dashboard"
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 min-w-[65px] sm:min-w-0 py-2.5 px-1.5 rounded-xl border text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
            activeTab === "dashboard"
              ? "border-fuchsia-400 border-b-[4px] border-b-fuchsia-700 bg-fuchsia-500 text-zinc-950 font-black shadow-md translate-y-0"
              : "border-zinc-800 border-b-[4px] border-b-zinc-950 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 active:translate-y-[2px] active:border-b-[2px]"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Gestione</span>
        </button>

        <button
          id="tab-add-post"
          onClick={() => { if (!editingPostId) resetForm(); setActiveTab("add-post"); }}
          className={`flex-1 min-w-[65px] sm:min-w-0 py-2.5 px-1.5 rounded-xl border text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
            activeTab === "add-post"
              ? "border-fuchsia-400 border-b-[4px] border-b-fuchsia-700 bg-fuchsia-500 text-zinc-950 font-black shadow-md translate-y-0"
              : "border-zinc-800 border-b-[4px] border-b-zinc-950 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 active:translate-y-[2px] active:border-b-[2px]"
          }`}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{editingPostId ? "Modifica" : "Nuovo"}</span>
        </button>

        <button
          id="tab-bookings"
          onClick={() => setActiveTab("bookings")}
          className={`flex-1 min-w-[65px] sm:min-w-0 py-2.5 px-1.5 rounded-xl border text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
            activeTab === "bookings"
              ? "border-fuchsia-400 border-b-[4px] border-b-fuchsia-700 bg-fuchsia-500 text-zinc-950 font-black shadow-md translate-y-0"
              : "border-zinc-800 border-b-[4px] border-b-zinc-950 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 active:translate-y-[2px] active:border-b-[2px]"
          }`}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Prenota</span>
        </button>

        <button
          id="tab-settings"
          onClick={() => setActiveTab("settings")}
          className={`flex-1 min-w-[65px] sm:min-w-0 py-2.5 px-1.5 rounded-xl border text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
            activeTab === "settings"
              ? "border-fuchsia-400 border-b-[4px] border-b-fuchsia-700 bg-fuchsia-500 text-zinc-950 font-black shadow-md translate-y-0"
              : "border-zinc-800 border-b-[4px] border-b-zinc-950 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 active:translate-y-[2px] active:border-b-[2px]"
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Opzioni</span>
        </button>
      </div>

      {/* Main Content Body Container */}
      <div 
        className="flex-1 overflow-y-auto bg-zinc-950 p-4 pb-20 scrollbar-none overscroll-y-contain touch-pan-y"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        
        {/* ==================== TAB 1: DASHBOARD ==================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Quick Analytics Summary Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-zinc-900 bg-zinc-900/30 flex flex-col justify-between">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Post Attivi</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-black text-zinc-100">{activePosts.length}</span>
                  <span className="text-[10px] text-zinc-500">su {posts.length}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-zinc-900 bg-zinc-900/30 flex flex-col justify-between">
                <span className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider">Click Totali</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-black text-fuchsia-400">{totalClicks}</span>
                  <span className="text-[10px] text-zinc-500">su WhatsApp</span>
                </div>
              </div>
            </div>

            {/* Posts List Header */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-4 h-4 text-fuchsia-400" />
                  <span>Elenco dei Post nel Feed</span>
                </h2>
              </div>

              {posts.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 space-y-3">
                  <p className="text-xs text-zinc-500">Non hai ancora inserito alcun post nel tuo Visual Stream.</p>
                  <button
                    id="dashboard-first-post"
                    onClick={() => setActiveTab("add-post")}
                    className="py-1.5 px-3 rounded-lg bg-fuchsia-500 text-zinc-950 font-bold text-xs hover:bg-fuchsia-400 transition-colors"
                  >
                    Crea il Primo Post
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.map((post) => {
                    const postIsExpired = post.expiresAt && new Date(post.expiresAt) <= now;
                    return (
                      <div
                        key={post.id}
                        id={`dashboard-post-item-${post.id}`}
                        className={`p-3.5 rounded-xl border flex gap-3.5 items-center justify-between bg-zinc-900/20 transition-all ${
                          postIsExpired 
                            ? "border-zinc-900 opacity-60 bg-zinc-950" 
                            : "border-zinc-800/80 hover:border-zinc-700/60"
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 relative">
                          {post.mediaType === "video" ? (
                            <video 
                              src={post.mediaUrl} 
                              className="w-full h-full object-cover"
                              muted
                              loop
                              playsInline
                              autoPlay
                            />
                          ) : (
                            <img 
                              src={post.mediaUrl} 
                              alt={getPostDefaultName(post, posts)} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          {post.mediaType === "video" && (
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                              <div className="bg-fuchsia-500/90 rounded-full p-1 shadow-lg">
                                <Play className="w-2.5 h-2.5 text-black fill-black" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Text and stats */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-zinc-200 truncate leading-snug">
                              {getPostDefaultName(post, posts)}
                            </h3>
                          </div>
                          <p className="text-[10px] text-zinc-500 truncate leading-relaxed mt-0.5 hidden sm:block">
                            {post.description}
                          </p>
                          
                          {/* Expiration warning subtext */}
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[9px] font-mono font-bold bg-zinc-800/80 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 flex items-center gap-1">
                              <Smartphone className="w-2.5 h-2.5 text-fuchsia-400" />
                              {post.clickCount || 0} Click
                            </span>

                            {post.expiresAt ? (
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 border ${
                                postIsExpired 
                                  ? "bg-rose-950/20 border-rose-900/40 text-rose-400" 
                                  : "bg-fuchsia-950/20 border-fuchsia-900/40 text-fuchsia-300 hidden sm:flex"
                              }`}>
                                <Calendar className="w-2.5 h-2.5" />
                                {postIsExpired ? "Scaduto" : `Scade il ${new Date(post.expiresAt).toLocaleDateString("it-IT", { day: '2-digit', month: '2-digit' })}`}
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-850 text-zinc-500 hidden sm:inline-block">
                                Persistente
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            id={`edit-post-btn-${post.id}`}
                            onClick={() => handleEditClick(post)}
                            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Modifica Post"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            id={`delete-post-btn-${post.id}`}
                            onClick={() => handleDeleteClick(post.id)}
                            className="p-2 rounded-lg hover:bg-rose-950/30 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Elimina Post"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: CREATE / EDIT POST ==================== */}
        {activeTab === "add-post" && (
          <div className="space-y-6 max-w-lg mx-auto pb-10">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h2 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-4 h-4 text-fuchsia-400" />
                <span>{editingPostId && posts.find(p => p.id === editingPostId) ? `Modifica: ${getPostDefaultName(posts.find(p => p.id === editingPostId)!, posts)}` : "Crea Nuovo Stream Post"}</span>
              </h2>
              {editingPostId && (
                <button
                  id="cancel-edit-btn"
                  onClick={resetForm}
                  className="text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  Annulla Modifica
                </button>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-5">
              
              {/* Title Input */}

              {/* Unified Media Upload Area */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 block">Scegli Foto o Video</label>
                
                {/* Hidden input for local file selection */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*,video/*" 
                  className="hidden" 
                />

                <div 
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`group relative flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-fuchsia-500 bg-zinc-900/20 hover:bg-zinc-900/60 cursor-pointer'} rounded-2xl p-8 text-center transition-all duration-300`}
                >
                  <div className="p-4 rounded-full bg-zinc-800/40 group-hover:bg-fuchsia-500/10 text-zinc-400 group-hover:text-fuchsia-400 transition-colors mb-3">
                    {isUploading ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-fuchsia-400" />
                    ) : (
                      <Plus className="w-6 h-6 stroke-[2.5]" />
                    )}
                  </div>
                  <p className="text-xs font-bold text-zinc-300 group-hover:text-white transition-colors">
                    {isUploading ? "Caricamento in corso su Vercel Blob..." : (mediaUrl ? "Sostituisci File" : "Carica Foto o Video")}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-[220px] mx-auto">
                    {isUploading ? "Attendi completamento, stiamo archiviando il file..." : "Clicca per sfogliare i file del dispositivo (supporta immagini e video)"}
                  </p>
                </div>

                {isUploading && (
                  <div className="text-[9px] text-fuchsia-400 font-bold flex items-center justify-center gap-1 bg-fuchsia-500/5 border border-fuchsia-500/10 rounded-xl py-2 px-3">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Archiviazione multimediale in corso...
                  </div>
                )}

                {!isUploading && mediaUrl && (
                  <div className="text-[9px] text-emerald-400 font-bold flex items-center justify-center gap-1 bg-emerald-500/5 border border-emerald-500/10 rounded-xl py-2 px-3">
                    <Check className="w-3 h-3" /> File archiviato correttamente ({mediaType === "video" ? "Video" : "Immagine"})
                  </div>
                )}
              </div>

              {/* Testo in Sovrimpressione (Overlay) */}
              <div className="space-y-4 p-4 rounded-xl border border-zinc-900 bg-zinc-900/10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Testo in Sovrimpressione sulla Foto</span>

                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-400 block">Scrivi il testo</span>
                  <textarea
                    id="form-overlay-text"
                    rows={2}
                    placeholder="Scrivi qui il testo (es. NUOVO ARRIVO! Sconto 20%)"
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    className="w-full px-3 py-2.5 bg-zinc-900 rounded-lg border border-zinc-800 text-xs text-zinc-100 font-bold focus:outline-none focus:border-fuchsia-500 transition-colors"
                  />
                </div>

                {/* Draggable Live Preview */}
                {mediaUrl && (
                  <div className="space-y-2 mt-4 pt-4 border-t border-zinc-800/40">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">Posizionamento Trascina & Rilascia</span>
                    
                    <div 
                      ref={previewRef}
                      className="relative aspect-[9/16] w-full max-w-[220px] mx-auto rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 select-none cursor-crosshair mt-2"
                    >
                      {mediaType === "video" ? (
                        <video 
                          src={mediaUrl} 
                          muted 
                          loop 
                          autoPlay 
                          playsInline 
                          className="w-full h-full object-cover pointer-events-none" 
                        />
                      ) : (
                        <img 
                          src={mediaUrl} 
                          alt="Anteprima" 
                          className="w-full h-full object-cover pointer-events-none" 
                          referrerPolicy="no-referrer"
                        />
                      )}
                      
                      {/* Draggable overlay message badge */}
                      {overlayText ? (
                        <div 
                          onMouseDown={handleDragStart}
                          onTouchStart={handleDragStart}
                          style={{ 
                            left: `${overlayX}%`, 
                            top: `${overlayY}%`,
                          }}
                          className="absolute z-30 select-none cursor-grab active:cursor-grabbing text-left touch-none -translate-x-1/2 -translate-y-1/2"
                        >
                          <span className="inline-block bg-zinc-950/85 backdrop-blur-sm border border-white/25 text-white font-black uppercase tracking-wider text-[9px] px-2.5 py-1.5 rounded-lg shadow-2xl pointer-events-none break-words max-w-[160px]">
                            {overlayText}
                          </span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[9px] text-zinc-500 uppercase tracking-widest font-black text-center p-4">
                          Digita un testo sopra per vederlo qui
                        </div>
                      )}
                      
                      <div className="absolute bottom-2 right-2 z-10 text-[7px] font-mono bg-black/75 px-1.5 py-0.5 rounded text-zinc-400">
                        X: {overlayX}% | Y: {overlayY}%
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  id="form-submit"
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isUploading ? "Caricamento file..." : (isSubmitting ? "Salvataggio in corso..." : (editingPostId ? "Aggiorna Post" : "Pubblica sul Visual Stream"))}
                </button>
              </div>


            </form>
          </div>
        )}



        {/* ==================== TAB: BOOKINGS (PRENOTAZIONI) ==================== */}
        {activeTab === "bookings" && (
          <div className="space-y-6 max-w-2xl mx-auto pb-10">
            <div className="border-b border-zinc-900 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-fuchsia-400" />
                  <span>Prenotazioni Ricevute</span>
                </h2>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Gestisci e monitora le prenotazioni in tempo reale nell'applicazione.
                </p>
              </div>
              <button
                onClick={fetchBookings}
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 transition-all text-xs"
                title="Ricarica elenco"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBookings ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingBookings ? (
              <div className="py-12 text-center">
                <RefreshCw className="w-6 h-6 text-fuchsia-400 animate-spin mx-auto mb-2" />
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Caricamento prenotazioni...</p>
              </div>
            ) : bookings.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-zinc-900 rounded-2xl bg-zinc-950/40">
                <Calendar className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Nessuna Prenotazione</h3>
                <p className="text-[10px] text-zinc-600 max-w-xs mx-auto mt-1 leading-relaxed">
                  Le prenotazioni effettuate dai clienti sul sito compariranno qui in tempo reale.
                </p>
              </div>
            ) : (() => {
              const processedBookings = [...bookings]
                .filter((booking) => {
                  if (bookingDayFilter === "all") return true;
                  return getBookingDayKey(booking.date) === bookingDayFilter;
                })
                .sort((a, b) => {
                  const dateA = parseBookingDate(a.date).getTime();
                  const dateB = parseBookingDate(b.date).getTime();
                  return bookingSortOrder === "asc" ? dateA - dateB : dateB - dateA;
                });

              let lastDayKey = "";

              return (
                <div className="space-y-4">
                  {/* Sorting & Filter controls */}
                  <div className="grid grid-cols-2 gap-2 bg-zinc-950/40 p-2 rounded-xl border border-zinc-900">
                    {/* Day Filter select */}
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase tracking-[0.15em] font-black text-zinc-500 block">Filtra per Giorno</label>
                      <select
                        id="booking-day-filter"
                        value={bookingDayFilter}
                        onChange={(e) => setBookingDayFilter(e.target.value)}
                        className="w-full px-2 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800 border-b-[2px] border-b-zinc-950 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:text-zinc-200 focus:outline-none focus:border-fuchsia-500 transition-colors cursor-pointer truncate"
                      >
                        <option value="all" className="bg-zinc-950 text-zinc-300 text-xs">Tutti i giorni</option>
                        {(Array.from(new Set(bookings.map(b => getBookingDayKey(b.date)))) as string[])
                          .filter(Boolean)
                          .sort()
                          .map((dayKey) => (
                            <option key={dayKey} value={dayKey} className="bg-zinc-950 text-zinc-300 text-xs">
                              {formatBookingDayHeader(dayKey)}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Sort Order select */}
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase tracking-[0.15em] font-black text-zinc-500 block">Ordina per Data</label>
                      <select
                        id="booking-sort-order"
                        value={bookingSortOrder}
                        onChange={(e) => setBookingSortOrder(e.target.value as "asc" | "desc")}
                        className="w-full px-2 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800 border-b-[2px] border-b-zinc-950 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:text-zinc-200 focus:outline-none focus:border-fuchsia-500 transition-colors cursor-pointer truncate"
                      >
                        <option value="asc" className="bg-zinc-950 text-zinc-300 text-xs">Crescente ▲</option>
                        <option value="desc" className="bg-zinc-950 text-zinc-300 text-xs">Decrescente ▼</option>
                      </select>
                    </div>
                  </div>

                  {processedBookings.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-zinc-900 rounded-xl">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Nessuna prenotazione per questo giorno</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {processedBookings.map((booking) => {
                        const dayKey = getBookingDayKey(booking.date);
                        const showHeader = dayKey !== lastDayKey;
                        lastDayKey = dayKey;

                        return (
                          <React.Fragment key={booking.id}>
                            {showHeader && (
                              <div className="pt-4 pb-1.5 first:pt-0">
                                <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400 bg-fuchsia-500/5 px-3 py-1.5 rounded-lg border border-fuchsia-500/10 inline-block">
                                  {formatBookingDayHeader(dayKey)}
                                </span>
                              </div>
                            )}

                            <div className="p-4 rounded-xl border border-zinc-900 bg-zinc-900/10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-zinc-805 hover:bg-zinc-900/20 transition-all">
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[9px] uppercase font-bold tracking-widest bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 px-2 py-0.5 rounded">
                                    {booking.guests} {booking.guests === 1 ? "Persona" : "Persone"}
                                  </span>
                                  <span className="text-[9px] font-mono text-zinc-500">
                                    Ricevuta: {new Date(booking.createdAt).toLocaleDateString("it-IT", { dateStyle: "short" })}
                                  </span>
                                </div>
                                
                                <h4 className="text-sm font-bold text-zinc-200 truncate">
                                  {booking.name}
                                </h4>
                                
                                <p className="text-xs text-zinc-500 truncate">
                                  Esperienza: <span className="text-zinc-400 font-medium">{booking.postTitle}</span>
                                </p>

                                <div className="flex items-center gap-4 pt-1">
                                  <span className="text-xs font-semibold text-fuchsia-400 flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formatBookingDateOnly(booking.date)}
                                  </span>
                                  
                                  <a
                                    href={`tel:${booking.phone}`}
                                    className="text-xs text-zinc-400 hover:text-white transition-all flex items-center gap-1 font-mono"
                                  >
                                    <Smartphone className="w-3.5 h-3.5" />
                                    {booking.phone}
                                  </a>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                <a
                                  href={`https://wa.me/${booking.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Ciao ${booking.name}, ti contatto riguardo la tua prenotazione per "${booking.postTitle}" il ${formatBookingDateOnly(booking.date)}...`)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="py-1.5 px-3 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-zinc-950 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>Chat WA</span>
                                </a>
                                
                                <button
                                  onClick={() => handleDeleteBooking(booking.id)}
                                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-rose-950/30 hover:border-rose-900/50 hover:text-rose-400 text-zinc-500 transition-all cursor-pointer"
                                  title="Elimina prenotazione"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ==================== TAB 4: SETTINGS ==================== */}
        {activeTab === "settings" && (
          <div className="space-y-6 max-w-lg mx-auto pb-10">
            <div className="border-b border-zinc-900 pb-3">
              <h2 className="text-sm font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-fuchsia-400" />
                <span>Impostazioni Generali</span>
              </h2>
              <p className="text-[10px] text-zinc-500 mt-1">Configura il comportamento globale del tuo canale Visual Stream.</p>
            </div>

            {settingsSaved && (
              <div className="p-3 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-xs font-semibold">
                Impostazioni salvate con successo!
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-5">
              
              {/* WhatsApp Number Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 block">Numero di Cellulare WhatsApp per Prenotazioni</label>
                  <span className="text-[9px] text-zinc-500 font-mono">Includi prefisso paese (es. 39 per Italia)</span>
                </div>
                <input
                  id="settings-whatsapp-num"
                  type="text"
                  required
                  placeholder="es. 393281234567"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 rounded-xl border border-zinc-800/80 text-zinc-100 focus:outline-none focus:border-fuchsia-500 text-sm"
                />
                <span className="text-[10px] text-zinc-600 block leading-relaxed">
                  Tutti i tasti di acquisto o di contatto del sito instraderanno i messaggi precompilati su questo numero di telefono.
                </span>
              </div>

              {/* Brand Title Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 block">Titolo del Canale (Brand)</label>
                <input
                  id="settings-stream-title"
                  type="text"
                  required
                  placeholder="es. Visual Stream"
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 rounded-xl border border-zinc-800/80 text-zinc-100 focus:outline-none focus:border-fuchsia-500 text-sm"
                />
              </div>

              {/* Subtitle Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest font-black text-zinc-400 block">Sottotitolo della Landing Page</label>
                <input
                  id="settings-stream-sub"
                  type="text"
                  required
                  placeholder="es. Le novità e scoperte della settimana"
                  value={localSubtitle}
                  onChange={(e) => setLocalSubtitle(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 rounded-xl border border-zinc-800/80 text-zinc-100 focus:outline-none focus:border-fuchsia-500 text-sm"
                />
              </div>

              {/* Save Button */}
              <button
                id="save-settings-submit"
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.01] active:scale-95 transition-all cursor-pointer"
              >
                Salva Impostazioni
              </button>

            </form>
          </div>
        )}

      </div>
    </div>
  );
}
