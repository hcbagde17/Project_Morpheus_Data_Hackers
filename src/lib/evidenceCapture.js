/**
 * EvidenceCapture — Manages a circular video buffer and clip extraction.
 *
 * Architecture:
 *   1. Continuously records from a MediaStream using MediaRecorder.
 *   2. Keeps last ~30 seconds of chunks in a circular buffer.
 *   3. On flag event, extracts the last N seconds as a Blob.
 *   4. Uploads the clip to Supabase Storage.
 *   5. Links the evidence URL to the flag record.
 */
import { supabase } from './supabase';

const BUFFER_DURATION_MS = 30000; // 30 seconds
const CHUNK_INTERVAL_MS = 1000;   // 1-second chunks

export class EvidenceCapture {
    constructor() {
        this.chunks = [];
        this.chunkTimestamps = [];
        this.recorder = null;
        this.stream = null;
        this.isRecording = false;
        this.uploadQueue = [];
        this.isUploading = false;
    }

    /**
     * Start recording from a media stream
     * @param {MediaStream} stream - Camera/screen stream
     */
    start(stream) {
        if (this.isRecording) return;
        this.stream = stream;

        const mimeType = this._getSupportedMimeType();
        this.recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 500000, // 500kbps for small clips
        });

        this.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
                this.chunkTimestamps.push(Date.now());
                this._pruneBuffer();
            }
        };

        this.recorder.start(CHUNK_INTERVAL_MS);
        this.isRecording = true;
        console.log('EvidenceCapture: Recording started', { mimeType, streamId: stream.id });
    }

    /**
     * Stop recording
     */
    stop() {
        if (this.recorder && this.isRecording) {
            this.recorder.stop();
            this.isRecording = false;
            this.chunks = [];
            this.chunkTimestamps = [];
            console.log('EvidenceCapture: Recording stopped');
        }
    }

    /**
     * Extract the last N seconds as a Blob
     * @param {number} seconds - Number of seconds to extract (default: 10)
     * @returns {Blob|null}
     */
    extractClip(seconds = 10) {
        if (this.chunks.length === 0) return null;

        const cutoffTime = Date.now() - (seconds * 1000);
        const relevantChunks = [];

        for (let i = this.chunkTimestamps.length - 1; i >= 0; i--) {
            if (this.chunkTimestamps[i] >= cutoffTime) {
                relevantChunks.unshift(this.chunks[i]);
            } else {
                break;
            }
        }

        if (relevantChunks.length === 0) return null;

        const mimeType = this._getSupportedMimeType();
        return new Blob(relevantChunks, { type: mimeType });
    }

    /**
     * Capture evidence for a flag and queue upload
     * @param {string} sessionId - Exam session ID
     * @param {string} flagId - Flag record ID
     * @param {number} clipDuration - Seconds to capture (default: 10)
     */
    async captureForFlag(sessionId, flagId, clipDuration = 10) {
        const clip = this.extractClip(clipDuration);
        if (!clip) {
            console.warn('EvidenceCapture: No video data available');
            return null;
        }

        const fileName = `${sessionId}/${flagId}_${Date.now()}.webm`;

        // Add to upload queue
        this.uploadQueue.push({ blob: clip, fileName, flagId });
        this._processQueue();

        return fileName;
    }

    /**
     * Process the upload queue (background, with retry)
     */
    async _processQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) return;
        this.isUploading = true;

        while (this.uploadQueue.length > 0) {
            const item = this.uploadQueue[0];

            try {
                // Upload to Supabase Storage
                const { data, error } = await supabase.storage
                    .from('evidence-videos')
                    .upload(item.fileName, item.blob, {
                        contentType: 'video/webm',
                        upsert: false,
                    });

                if (error) throw error;

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('evidence-videos')
                    .getPublicUrl(item.fileName);

                // Update flag record with evidence URL
                await supabase.from('flags').update({
                    evidence_url: urlData?.publicUrl || item.fileName,
                }).eq('id', item.flagId);

                console.log('EvidenceCapture: Uploaded', item.fileName);
                this.uploadQueue.shift(); // Remove from queue on success
            } catch (err) {
                console.error('EvidenceCapture: Upload failed', {
                    fileName: item.fileName,
                    error: err.message,
                    details: err
                });
                // Move to end of queue for retry
                this.uploadQueue.push(this.uploadQueue.shift());
                // Wait before retrying
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        this.isUploading = false;
    }

    /**
     * Prune the circular buffer to keep only the last BUFFER_DURATION_MS
     */
    _pruneBuffer() {
        const cutoff = Date.now() - BUFFER_DURATION_MS;
        while (this.chunkTimestamps.length > 0 && this.chunkTimestamps[0] < cutoff) {
            this.chunks.shift();
            this.chunkTimestamps.shift();
        }
    }

    /**
     * Get a supported MIME type for MediaRecorder
     */
    _getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'video/webm';
    }

    /**
     * Get queue status
     */
    getQueueStatus() {
        return {
            pending: this.uploadQueue.length,
            bufferSize: this.chunks.length,
            isRecording: this.isRecording,
        };
    }
}

// Singleton instance
let instance = null;
export const getEvidenceCapture = () => {
    if (!instance) instance = new EvidenceCapture();
    return instance;
};
