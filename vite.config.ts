import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, Plugin} from 'vite';

function googleTagManagerPlugin(gtmId: string): Plugin {
  const cleanId = gtmId.trim().toUpperCase();
  const isValid = /^GTM-[A-Z0-9]{5,}$/.test(cleanId);

  return {
    name: 'myfav-google-tag-manager',
    transformIndexHtml(html) {
      if (!isValid) return html;
      const headSnippet = `<!-- Google Tag Manager -->
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${cleanId}');window.__MYFAV_GTM_ID__='${cleanId}';</script>
    <!-- End Google Tag Manager -->`;

      const bodyNoscript = `<!-- Google Tag Manager (noscript) -->
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${cleanId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <!-- End Google Tag Manager (noscript) -->`;

      return html
        .replace('</head>', `    ${headSnippet}\n  </head>`)
        .replace('<body class="antialiased">', `<body class="antialiased">\n    ${bodyNoscript}`);
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gtmId = env.VITE_GTM_ID || process.env.VITE_GTM_ID || '';

  return {
    plugins: [react(), tailwindcss(), googleTagManagerPlugin(gtmId)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor',
                test: /node_modules[\\/]/,
                maxSize: 450 * 1024,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
