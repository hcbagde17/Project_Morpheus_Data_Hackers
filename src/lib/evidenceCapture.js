/**
 * EvidenceCapture — Manages a circular video buffer and clip extraction.
 *
 * Architecture:
 *   1. Continuously records from a MediaStream using MediaRecorder.
 *   2. Keeps last ~30 seconds of chunks in a circular buffer.
 *   3. On flag event, extracts the last N seconds as a Blob.
 *   4. Uploads the clip to Supabase Storage (evidence-videos public bucket).
 *   5. Links the public URL to the flag record.
 *
 * Format: WebM preferred (universal browser/Electron support).
 * Auth note: App uses custom auth (anon role) — bucket MUST be public.
 */
import { supabase } from './supabase';

const BUFFER_DURATION_MS = 30000;  // 30-second circular buffer
const CHUNK_INTERVAL_MS = 1000;   // 1-second chunks

export class EvidenceCapture {
    constructor() {
        this.chunks = [];
        this.chunkTimestamps = [];
        this.recorder = null;
        this.stream = null;
        this.mimeType = null;
        this.isRecording = false;
        this.uploadQueue = [];
        this.isUploading = false;
        this._stopTimer = null;
    }

    // ─── MIME type (WebM preferred for broad compatibility) ───────────────────
    _getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ];
        for (const t of types) {
            if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return 'video/webm';
    }

    // Returns .webm or .mp4 depending on what MediaRecorder actually uses
    _getExtension(mimeType) {
        return (mimeType || '').startsWith('video/mp4') ? 'mp4' : 'webm';
    }

    // ─── Start recording ──────────────────────────────────────────────────────
    start(stream) {
        if (this.isRecording) return;
        this.stream = stream;

        const mimeType = this._getSupportedMimeType();
        try {
            this.recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 500_000,
            });
        } catch (e) {
            console.warn('[EvidenceCapture] Primary MIME unsupported, falling back:', e.message);
            this.recorder = new MediaRecorder(stream, { videoBitsPerSecond: 500_000 });
        }

        this.mimeType = this.recorder.mimeType || mimeType;

        this.recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.chunks.push(e.data);
                this.chunkTimestamps.push(Date.now());
                this._pruneBuffer();
            }
        };

        this.recorder.start(CHUNK_INTERVAL_MS);
        this.isRecording = true;
        console.log('[EvidenceCapture] Recording started', { mimeType: this.mimeType, streamId: stream.id });
    }

    // ─── Stop recording (with grace window) ──────────────────────────────────
    /**
     * BUG FIX: Don't clear chunks immediately — upload queue may still need them.
     * The buffer is cleared after a 15s grace period.
     */
    stop() {
        if (this.recorder && this.isRecording) {
            this.recorder.stop();
            this.isRecording = false;

            if (this._stopTimer) clearTimeout(this._stopTimer);

            // Keep buffer alive for 15s so any queued captureForFlag() can read it
            this._stopTimer = setTimeout(() => {
                this.chunks = [];
                this.chunkTimestamps = [];
                this._stopTimer = null;
                console.log('[EvidenceCapture] Buffer cleared after grace period');
            }, 15_000);

            console.log('[EvidenceCapture] Recorder stopped. Buffer held for 15s for pending uploads.');
        }
    }

    // ─── Extract clip from circular buffer ───────────────────────────────────
    extractClip(seconds = 10) {
        if (this.chunks.length === 0) {
            console.warn('[EvidenceCapture] extractClip: buffer is empty');
            return null;
        }

        const cutoffTime = Date.now() - (seconds * 1000);
        const relevantChunks = [];

        for (let i = this.chunkTimestamps.length - 1; i >= 0; i--) {
            if (this.chunkTimestamps[i] >= cutoffTime) {
                relevantChunks.unshift(this.chunks[i]);
            } else {
                break;
            }
        }

        if (relevantChunks.length === 0) {
            console.warn('[EvidenceCapture] extractClip: no chunks in window');
            return null;
        }

        const mimeType = this.mimeType || this._getSupportedMimeType();
        const blob = new Blob(relevantChunks, { type: mimeType });
        console.log(`[EvidenceCapture] Extracted clip: ${(blob.size / 1024).toFixed(0)} KB, ${relevantChunks.length} chunks`);
        return blob;
    }

    // ─── Queue evidence for upload ────────────────────────────────────────────
    async captureForFlag(sessionId, flagId, clipDuration = 10) {
        if (!sessionId || !flagId) {
            console.error('[EvidenceCapture] captureForFlag: missing sessionId or flagId');
            return null;
        }

        const clip = this.extractClip(clipDuration);
        if (!clip) {
            console.warn('[EvidenceCapture] captureForFlag: no clip data — skipping');
            return null;
        }

        const mimeType = this.mimeType || this._getSupportedMimeType();
        const ext = this._getExtension(mimeType);
        const contentType = mimeType.split(';')[0]; // strip codec params for upload
        const fileName = `${sessionId}/${flagId}_${Date.now()}.${ext}`;

        this.uploadQueue.push({ blob: clip, fileName, flagId, contentType });
        console.log(`[EvidenceCapture] Queued clip for upload: ${fileName} (${contentType})`);
        this._processQueue(); // fire-and-forget
        return fileName;
    }

    // ─── Upload queue processor ───────────────────────────────────────────────
    async _processQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) return;
        this.isUploading = true;

        while (this.uploadQueue.length > 0) {
            const item = this.uploadQueue[0];

            try {
                console.log(`[EvidenceCapture] Uploading ${item.fileName} (${(item.blob.size / 1024).toFixed(0)} KB)...`);

                // Step 1 — Upload to Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('evidence-videos')
                    .upload(item.fileName, item.blob, {
                        contentType: item.contentType || 'video/webm',
                        upsert: false,
                    });

                if (uploadError) {
                    console.error('[EvidenceCapture] Upload error:', uploadError);
                    throw uploadError;
                }

                console.log('[EvidenceCapture] Upload success:', uploadData?.path);

                // Step 2 — Get public URL (bucket must be public for anon access)
                const { data: urlData } = supabase.storage
                    .from('evidence-videos')
                    .getPublicUrl(item.fileName);

                const evidenceUrl = urlData?.publicUrl;

                if (!evidenceUrl) {
                    console.error('[EvidenceCapture] getPublicUrl returned no URL');
                    throw new Error('Could not get public URL after upload');
                }

                console.log('[EvidenceCapture] Public URL:', evidenceUrl);

                // Step 3 — Update the flag record with the evidence URL
                const { error: updateError } = await supabase
                    .from('flags')
                    .update({ evidence_url: evidenceUrl })
                    .eq('id', item.flagId);

                if (updateError) {
                    console.error('[EvidenceCapture] Flag update error:', updateError);
                    throw updateError;
                }

                console.log(`[EvidenceCapture] ✓ Evidence linked to flag ${item.flagId}: ${evidenceUrl}`);
                this.uploadQueue.shift(); // remove from queue on success

            } catch (err) {
                console.error('[EvidenceCapture] Upload failed for', item.fileName, '—', err.message);
                // Retry: move to end of queue, wait 5s
                this.uploadQueue.push(this.uploadQueue.shift());
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        this.isUploading = false;
    }

    // ─── Buffer maintenance ───────────────────────────────────────────────────
    _pruneBuffer() {
        const cutoff = Date.now() - BUFFER_DURATION_MS;
        while (this.chunkTimestamps.length > 0 && this.chunkTimestamps[0] < cutoff) {
            this.chunks.shift();
            this.chunkTimestamps.shift();
        }
    }

    // ─── Status info ──────────────────────────────────────────────────────────
    getQueueStatus() {
        return {
            pending: this.uploadQueue.length,
            bufferSize: this.chunks.length,
            isRecording: this.isRecording,
            mimeType: this.mimeType,
            isUploading: this.isUploading,
        };
    }
}

// Singleton per session
let instance = null;
export const getEvidenceCapture = () => {
    if (!instance) instance = new EvidenceCapture();
    return instance;
};
