import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'calendar': [
            '@fullcalendar/core',
            '@fullcalendar/daygrid',
            '@fullcalendar/interaction',
            '@fullcalendar/luxon3',
            '@fullcalendar/react',
            '@fullcalendar/timegrid',
          ],
          'charts': ['recharts'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'animations': ['framer-motion'],
          'utils': ['luxon', 'axios'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Marcai',
        short_name: 'Marcai',
        description: 'Marcai — Sistema de agendamentos para profissionais',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          // Android Icons
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          // iOS Icons
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/apple-touch-icon-167x167.png',
            sizes: '167x167',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/apple-touch-icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      devOptions: {
        enabled: true
      }
    }),
  ],
})