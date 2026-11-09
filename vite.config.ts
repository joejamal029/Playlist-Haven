import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/spotify-embed': {
            target: 'https://open.spotify.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/spotify-embed/, '/embed'),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
            }
          },
          '/api/spotify-token': {
            target: 'https://open.spotify.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/spotify-token/, '/api/token'),
            headers: {
              'Origin': 'https://open.spotify.com',
              'Referer': 'https://open.spotify.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            }
          },
          '/api/spotify-servertime': {
            target: 'https://open.spotify.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/spotify-servertime/, '/api/server-time'),
            headers: {
              'Origin': 'https://open.spotify.com',
              'Referer': 'https://open.spotify.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            }
          },
          '/api/spotify-clienttoken': {
            target: 'https://clienttoken.spotify.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/spotify-clienttoken/, '/v1/clienttoken'),
            headers: {
              'Origin': 'https://open.spotify.com',
              'Referer': 'https://open.spotify.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            }
          },
          '/api/spotify-pathfinder': {
            target: 'https://api-partner.spotify.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/spotify-pathfinder/, '/pathfinder/v2/query'),
            headers: {
              'Origin': 'https://open.spotify.com',
              'Referer': 'https://open.spotify.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            }
          }
        }
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
