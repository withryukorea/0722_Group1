const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const clone = (value) => JSON.parse(JSON.stringify(value));

function extensionOf(file) {
  const fromName = path.extname(file.originalname || "").toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  }[file.mimetype] || ".bin";
}

class SupabasePersistence {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.client = options.client || null;
    this.stateId = this.env.SUPABASE_STATE_ID || "main";
    this.bucket = this.env.SUPABASE_BUCKET || "receipt-images";
    this.mode = "memory";
    this.ready = false;
    this.revision = 0;
    this.lastSavedAt = null;
    this.lastError = null;
    this.saveQueue = Promise.resolve();
  }

  get secret() {
    return this.env.SUPABASE_SECRET_KEY || this.env.SUPABASE_SERVICE_ROLE_KEY || "";
  }

  isConfigured() {
    return Boolean(this.env.SUPABASE_URL && this.secret);
  }

  isCloudEnabled() {
    return this.isConfigured() && this.ready && this.mode === "supabase";
  }

  getClient() {
    if (!this.client) {
      this.client = createClient(this.env.SUPABASE_URL, this.secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    return this.client;
  }

  async initialize(db, replaceState) {
    if (!this.isConfigured()) {
      this.mode = "memory";
      this.ready = true;
      return this.status();
    }

    try {
      const { data, error } = await this.getClient()
        .from("app_state")
        .select("data,revision,updated_at")
        .eq("id", this.stateId)
        .maybeSingle();
      if (error) throw error;

      const saved = data && data.data && typeof data.data === "object" ? data.data : null;
      const hasSavedState = saved && Object.keys(saved).length > 0;
      if (hasSavedState) {
        replaceState(saved);
        this.revision = Number(data.revision) || 0;
        this.lastSavedAt = data.updated_at || null;
      } else {
        await this.saveSnapshotNow(clone(db), 0);
      }

      this.mode = "supabase";
      this.ready = true;
      this.lastError = null;
      return this.status();
    } catch (error) {
      this.ready = false;
      this.lastError = error.message || String(error);
      throw new Error(`Supabase 초기화 실패: ${this.lastError}`);
    }
  }

  async saveSnapshotNow(snapshot, requestedRevision) {
    const nextRevision = requestedRevision == null ? this.revision + 1 : requestedRevision;
    const updatedAt = new Date().toISOString();
    const { error } = await this.getClient().from("app_state").upsert({
      id: this.stateId,
      data: snapshot,
      revision: nextRevision,
      updated_at: updatedAt,
    }, { onConflict: "id" });
    if (error) throw error;
    this.revision = nextRevision;
    this.lastSavedAt = updatedAt;
    this.lastError = null;
  }

  async persist(db) {
    if (!this.isCloudEnabled()) return;
    const snapshot = clone(db);
    const run = this.saveQueue
      .catch(() => undefined)
      .then(() => this.saveSnapshotNow(snapshot));
    this.saveQueue = run;
    try {
      await run;
    } catch (error) {
      this.lastError = error.message || String(error);
      throw error;
    }
  }

  async uploadReceiptFile(receiptId, variant, file) {
    if (!this.isCloudEnabled()) return null;
    const objectPath = `receipts/${receiptId}/${variant}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${extensionOf(file)}`;
    const body = fs.readFileSync(file.path);
    const { error } = await this.getClient().storage.from(this.bucket).upload(objectPath, body, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      this.lastError = error.message || String(error);
      throw error;
    }
    return { path: objectPath, contentType: file.mimetype || "application/octet-stream" };
  }

  async downloadReceiptFile(objectPath) {
    if (!this.isCloudEnabled() || !objectPath) return null;
    const { data, error } = await this.getClient().storage.from(this.bucket).download(objectPath);
    if (error) {
      this.lastError = error.message || String(error);
      throw error;
    }
    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || "application/octet-stream",
    };
  }

  async removeReceiptFile(objectPath) {
    if (!this.isCloudEnabled() || !objectPath) return;
    const { error } = await this.getClient().storage.from(this.bucket).remove([objectPath]);
    if (error) this.lastError = error.message || String(error);
  }

  status() {
    return {
      configured: this.isConfigured(),
      ready: this.ready,
      mode: this.mode,
      stateId: this.stateId,
      bucket: this.bucket,
      revision: this.revision,
      lastSavedAt: this.lastSavedAt,
      error: this.lastError,
    };
  }
}

const persistence = new SupabasePersistence();

module.exports = persistence;
module.exports.SupabasePersistence = SupabasePersistence;
