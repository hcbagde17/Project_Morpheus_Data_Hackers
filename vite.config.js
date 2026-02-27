import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Vite plugin: serve onnxruntime-web runtime files (*.wasm, *.mjs) directly
 * from the public/ folder, BYPASSING Vite's module transform pipeline.
 *
 * Without this, Vite intercepts .mjs files, appends ?import, and tries to
 * transform them as ES modules — which fails with a 500 because ORT's
 * generated glue code isn't compatible with Vite's transform.
 */
const ortStaticPlugin = {
    name: 'ort-static-serve',
    configureServer(server) {
        // Register BEFORE Vite's internal middleware so we intercept first
        server.middlewares.use((req, res, next) => {
            // Strip query string (?import, ?v=...) to get the clean path
            const cleanUrl = req.url?.split('?')[0] || '';

            // Only intercept ort-wasm files in the root path
            if (!cleanUrl.includes('ort-wasm')) return next();

            const filename = cleanUrl.split('/').pop();
            const filePath = join(process.cwd(), 'public', filename);

            try {
                const content = readFileSync(filePath);

                if (filename.endsWith('.wasm')) {
                    res.setHeader('Content-Type', 'application/wasm');
                } else if (filename.endsWith('.mjs') || filename.endsWith('.js')) {
                    res.setHeader('Content-Type', 'text/javascript');
                }

                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.end(content);
            } catch {
                // File not found in public/, let Vite handle it
                next();
            }
        });
    },
};

export default defineConfig({
    plugins: [react(), ortStaticPlugin],
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});

