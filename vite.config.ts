import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  const devApiPlugin: import('vite').Plugin = {
    name: 'dev-api-endpoints',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/abacate-pay/create-link' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const token = env.ABACATEPAY_TOKEN || process.env.ABACATEPAY_TOKEN;
              if (!token) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Configuração de pagamento incompleta (token ausente).' }));
                return;
              }
              const upstream = await fetch('https://api.abacatepay.com/v2/payment-links/create', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body,
              });
              const data = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if (req.url === '/api/sync-favorita' && req.method === 'POST') {
          (async () => {
            try {
              const { SyncJobRunner } = await import('./server/jobs/sync-job-runner');
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL || env.VITE_SUPABASE_URL;
              const supabaseKey = env.SUPABASE_KEY || process.env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
              if (!supabaseUrl || !supabaseKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Supabase URL/Key não configurados.' }));
                return;
              }
              const supabase = createClient(supabaseUrl, supabaseKey);
              const result = SyncJobRunner.getInstance().startJob(supabase);
              res.statusCode = result.started ? 202 : 409;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: result.started, ...result }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          })();
          return;
        }

        if (req.url === '/api/sync-favorita/status' && req.method === 'GET') {
          (async () => {
            try {
              const { SyncJobRunner } = await import('./server/jobs/sync-job-runner');
              const status = SyncJobRunner.getInstance().getStatus();
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, status }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          })();
          return;
        }

        next();
      });
    },
  };

  return {
    plugins: [
      react(), 
      tailwindcss(),
      devApiPlugin,
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'Consigna Beauty | Solução de Vendas para Consignação',
          short_name: 'Consigna',
          description: 'Sistema completo de gestão para vendas consignadas, com controle financeiro, gestão de sacolas, insights inteligentes e automação de cobranças.',
          theme_color: '#38a89d',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KAY || env.VITE_SUPABASE_ANON_KEY),
      'process.env.SUPABASE_ANON_KAY': JSON.stringify(env.SUPABASE_ANON_KAY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
