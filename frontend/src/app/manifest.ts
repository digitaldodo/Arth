import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SpendSense — Personal Finance Tracker',
    short_name: 'SpendSense',
    description:
      'Fast, disciplined personal finance tracker with exact integer-paise calculations.',
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    background_color: '#0D0D0F',
    theme_color: '#0D0D0F',
    lang: 'en-IN',
    dir: 'ltr',
    prefer_related_applications: false,
    icons: [
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
        src: '/icons/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
