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
        // The very first chunk MediaRecorder emits contains the WebM container
        // header (EBML element + Segment Info + Track headers). Without it,
        // any extracted sub-clip is an un-parseable fragment.
        // We keep it forever (never prune) and prepend it to every clip.
        this.headerChunk = null;
    }

    // ─── MIME type (WebM preferred for broad compatibility) ───────────────────
    _getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp8',   // VP8 is OSS — always works in Electron's FFmpeg
            'video/webm;codecs=vp9',   // VP9 is proprietary — may fail in Electron
            'video/webm',
            'video/mp4',
        ];
        for (const t of types) {
            if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return 'video/webm;codecs=vp8';
    }

    // Returns .webm or .mp4 depending on what MediaRecorder actually uses
    _getExtension(mimeType) {
        return (mimeType || '').startsWith('video/mp4') ? 'mp4' : 'webm';
    }


    // ─── Codec candidates (VP8 first — Electron OSS FFmpeg supports VP8, not VP9) ─
    static get CODEC_CANDIDATES() {
        return [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp9',
            'video/webm',
            'video/mp4',
            '',  // browser default
        ];
    }

    // ─── Start recording ──────────────────────────────────────────────────────
    start(stream) {
        if (this.isRecording) return;
        this.stream = stream;

        console.log('[EvidenceCapture] Probing codec support in this Electron build...');
        EvidenceCapture.CODEC_CANDIDATES.forEach(t => {
            if (t) console.log(`  isTypeSupported('${t}') =`, MediaRecorder.isTypeSupported(t));
        });

        // Try each codec by actually constructing a MediaRecorder — isTypeSupported
        // is unreliable in Electron and may return false for VP8 even when it works.
        let createdRecorder = null;
        let chosenMime = '';

        for (const mime of EvidenceCapture.CODEC_CANDIDATES) {
            try {
                const opts = mime
                    ? { mimeType: mime, videoBitsPerSecond: 500_000 }
                    : { videoBitsPerSecond: 500_000 };
                const r = new MediaRecorder(stream, opts);
                createdRecorder = r;
                chosenMime = mime;
                break;
            } catch (e) {
                console.warn(`[EvidenceCapture] Codec '${mime}' rejected:`, e.message);
            }
        }

        if (!createdRecorder) {
            console.error('[EvidenceCapture] No codec worked — cannot record evidence.');
            return;
        }

        this.recorder = createdRecorder;
        this.mimeType = this.recorder.mimeType || chosenMime || 'video/webm';
        console.log(`[EvidenceCapture] ✅ Recording with codec: "${this.mimeType}"`);

        this.headerChunk = null; // reset on each new recording

        this.recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                if (!this.headerChunk) {
                    // First chunk = WebM container header — keep it permanently
                    this.headerChunk = e.data;
                    console.log(`[EvidenceCapture] Header chunk captured: ${(e.data.size / 1024).toFixed(1)} KB`);
                }
                this.chunks.push(e.data);
                this.chunkTimestamps.push(Date.now());
                this._pruneBuffer();
            }
        };

        this.recorder.start(CHUNK_INTERVAL_MS);
        this.isRecording = true;
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
            console.warn('[EvidenceCapture] extractClip: no chunks in window, using all buffered chunks');
            relevantChunks.push(...this.chunks);
        }

        // CRITICAL FIX: Always prepend the header chunk.
        // The WebM EBML/Segment/Track header is only in the first chunk ever
        // recorded. After 30s of recording it gets pruned from the circular
        // buffer. Without it, the blob is a headerless fragment that
        // FFmpegDemuxer (and every other player) refuses to open.
        const allChunks = [];
        if (this.headerChunk && relevantChunks[0] !== this.headerChunk) {
            allChunks.push(this.headerChunk); // prepend header
        }
        allChunks.push(...relevantChunks);

        const mimeType = this.mimeType || 'video/webm';
        const blob = new Blob(allChunks, { type: mimeType });
        console.log(`[EvidenceCapture] Extracted clip: ${(blob.size / 1024).toFixed(0)} KB, ${relevantChunks.length} data chunks + header`);
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
