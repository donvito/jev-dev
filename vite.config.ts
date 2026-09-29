import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({ plugins: [svelte()], clearScreen: false, server: { strictPort: true, host: '127.0.0.1', port: 1420 }, envPrefix: ['VITE_', 'TAURI_ENV_'], build: { target: 'es2022', rollupOptions: { output: { manualChunks: { editor: ['@codemirror/state', '@codemirror/view', '@codemirror/commands', '@codemirror/language', '@codemirror/autocomplete', '@codemirror/lang-json'] } } } } });
