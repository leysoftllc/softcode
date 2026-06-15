import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // Deterministic names so the extension can find them without a manifest
                entryFileNames: 'index.js',
                chunkFileNames: 'chunk-[hash].js',
                assetFileNames: 'index.[ext]',
            },
        },
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
});
