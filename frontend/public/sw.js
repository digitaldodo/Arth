/**
 * SpendSense service worker. The root scope is retained for existing installs, but only
 * a mobile standalone client can use the offline entry. Personalized HTML and APIs
 * are never cached.
 */
const SW_VERSION = 'v1-tosdqt';
const CACHE_NAME = 'arth-shell-v2-' + SW_VERSION;
const PRECACHE_ASSETS = ["/offline","/manifest.webmanifest","/favicon.ico","/favicon.svg","/icons/icon-192x192.png","/icons/icon-512x512.png","/icons/icon-512x512-maskable.png","/icons/apple-touch-icon.png","/_next/static/chunks/057cs5x5qh9eo.js","/_next/static/chunks/05u43fqku3071.js","/_next/static/chunks/0cz1d0mv5g_q7.js","/_next/static/chunks/0nwa3gy97r5lz.js","/_next/static/chunks/0qrvlo-a__l4x.js","/_next/static/chunks/0r-py5a7_jgtj.js","/_next/static/chunks/0vvlqi-iws1v8.js","/_next/static/chunks/12-mtc2mqy74d.js","/_next/static/chunks/17cd0e4_u2ak8.js","/_next/static/chunks/1h8s_w6r2w5b-.js","/_next/static/chunks/1l9eb6eapfpax.js","/_next/static/chunks/1n4jf4fc83_44.js","/_next/static/chunks/1ucw2ffhiohxe.js","/_next/static/chunks/2c66hd8759yti.js","/_next/static/chunks/2co57-uztltgo.js","/_next/static/chunks/2jrzzxb_x3x3y.js","/_next/static/chunks/2m4pp4nbvj3a_.js","/_next/static/chunks/2qy5xhqb84qri.js","/_next/static/chunks/2s7wiw8l42su2.js","/_next/static/chunks/2_tvrlb-_t-d9.js","/_next/static/chunks/30x2qaf-rtd6c.js","/_next/static/chunks/36glx2e9e-s5m.js","/_next/static/chunks/37ipnqb3nxtuf.js","/_next/static/chunks/39173axfoz1m0.js","/_next/static/chunks/3b1aeijq98ndr.js","/_next/static/chunks/3bny2dbjkigll.js","/_next/static/chunks/3c1bu-3h4pdyk.css","/_next/static/chunks/3cl19zwtk5g-8.js","/_next/static/chunks/3ik6eb4581tqy.js","/_next/static/chunks/3kxkkqwfpsz11.js","/_next/static/chunks/3nh2zbm3uf-s8.js","/_next/static/chunks/3rpb0_y559jil.js","/_next/static/chunks/3sdi7u2qwyyom.js","/_next/static/chunks/3us3gjkluga-i.js","/_next/static/chunks/3vxkrhxwjabmz.js","/_next/static/chunks/3x6s8h7slpat3.js","/_next/static/chunks/turbopack-2u1d16houkiyo.js","/_next/static/cSVhLVXIl-5DPcZLqG02G/_buildManifest.js","/_next/static/cSVhLVXIl-5DPcZLqG02G/_clientMiddlewareManifest.js","/_next/static/cSVhLVXIl-5DPcZLqG02G/_ssgManifest.js","/_next/static/media/07a39a8a4660cc7c-s.p.0r6juujl39pe6.woff2","/_next/static/media/07c7676b89ed2778-s.p.2bn3s6zvc0dyp.woff2","/_next/static/media/2a04751c893bf294-s.1rgnod-3esatf.woff2","/_next/static/media/2bb852295097cd96-s.2dbetqa9o8jxf.woff2","/_next/static/media/2fb76073e23fd9e4-s.3lvt2whj97whp.woff2","/_next/static/media/45462fd7b7c12654-s.0k62hbripvv8p.woff2","/_next/static/media/46a9e2f250689b4a-s.0-dom-5bn10r2.woff2","/_next/static/media/6131cbbf5549afa2-s.2uwcyprjm3xu3.woff2","/_next/static/media/6e342921ee4dcd9d-s.2tuy5pz7dlieh.woff2","/_next/static/media/76b70a1dbe058eb5-s.1y4-pdgsjb-pw.woff2","/_next/static/media/9eb5a876700c0028-s.1uyisp29ctx0d.woff2","/_next/static/media/b0c6b664fd57c2c6-s.31988l_ccedte.woff2","/_next/static/media/ba63f6a0e436df8e-s.3-6t-g6q0vh0a.woff2","/offline.html"];
const FALLBACK_OFFLINE_HTML = "<!DOCTYPE html><html lang=\"en\" class=\"MOT0tq_variable FlyLvG_variable h-full antialiased\"><head><meta charSet=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\"/><link rel=\"preload\" href=\"/_next/static/media/07a39a8a4660cc7c-s.p.0r6juujl39pe6.woff2\" as=\"font\" crossorigin=\"\" type=\"font/woff2\"/><link rel=\"preload\" href=\"/_next/static/media/07c7676b89ed2778-s.p.2bn3s6zvc0dyp.woff2\" as=\"font\" crossorigin=\"\" type=\"font/woff2\"/><link rel=\"stylesheet\" href=\"/_next/static/chunks/3c1bu-3h4pdyk.css\" data-precedence=\"next\"/><link rel=\"preload\" as=\"script\" fetchPriority=\"low\" href=\"/_next/static/chunks/2jrzzxb_x3x3y.js\"/><script src=\"/_next/static/chunks/0vvlqi-iws1v8.js\" async=\"\"></script><script src=\"/_next/static/chunks/3ik6eb4581tqy.js\" async=\"\"></script><script src=\"/_next/static/chunks/3x6s8h7slpat3.js\" async=\"\"></script><script src=\"/_next/static/chunks/3rpb0_y559jil.js\" async=\"\"></script><script src=\"/_next/static/chunks/turbopack-2u1d16houkiyo.js\" async=\"\"></script><script src=\"/_next/static/chunks/0qrvlo-a__l4x.js\" async=\"\"></script><script src=\"/_next/static/chunks/3bny2dbjkigll.js\" async=\"\"></script><script src=\"/_next/static/chunks/37ipnqb3nxtuf.js\" async=\"\"></script><script src=\"/_next/static/chunks/2c66hd8759yti.js\" async=\"\"></script><script src=\"/_next/static/chunks/3kxkkqwfpsz11.js\" async=\"\"></script><script src=\"/_next/static/chunks/2s7wiw8l42su2.js\" async=\"\"></script><meta name=\"theme-color\" content=\"#FBFBF9\" media=\"(prefers-color-scheme: light)\"/><meta name=\"theme-color\" content=\"#0C0A09\" media=\"(prefers-color-scheme: dark)\"/><title>SpendSense — Personal Finance</title><meta name=\"description\" content=\"A clear, private-first personal finance workspace for tracking Indian income and spending, reviewing transactions, and organizing financial documents.\"/><meta name=\"application-name\" content=\"SpendSense\"/><link rel=\"manifest\" href=\"/manifest.webmanifest\"/><meta name=\"mobile-web-app-capable\" content=\"yes\"/><meta name=\"apple-mobile-web-app-title\" content=\"SpendSense\"/><meta name=\"apple-mobile-web-app-status-bar-style\" content=\"default\"/><meta property=\"og:title\" content=\"SpendSense — Personal Finance\"/><meta property=\"og:description\" content=\"Track income and spending, review transaction suggestions, and organize financial documents.\"/><meta property=\"og:site_name\" content=\"SpendSense\"/><meta property=\"og:type\" content=\"website\"/><meta name=\"twitter:card\" content=\"summary\"/><meta name=\"twitter:title\" content=\"SpendSense — Personal Finance\"/><meta name=\"twitter:description\" content=\"Track income and spending, review transaction suggestions, and organize financial documents.\"/><link rel=\"icon\" href=\"/favicon.ico?favicon.3dad3datm04e6.ico\" sizes=\"48x48\" type=\"image/x-icon\"/><link rel=\"icon\" href=\"/favicon.ico\"/><link rel=\"icon\" href=\"/favicon.svg\" type=\"image/svg+xml\"/><link rel=\"icon\" href=\"/icons/icon-192x192.png\" sizes=\"192x192\" type=\"image/png\"/><link rel=\"icon\" href=\"/icons/icon-512x512.png\" sizes=\"512x512\" type=\"image/png\"/><link rel=\"apple-touch-icon\" href=\"/icons/apple-touch-icon.png\" sizes=\"180x180\" type=\"image/png\"/><meta name=\"next-size-adjust\" content=\"\"/><script>\n              (function() {\n                try {\n                  var saved = localStorage.getItem('theme');\n                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;\n                  if (saved === 'light') {\n                    document.documentElement.classList.remove('dark');\n                    document.documentElement.classList.add('light');\n                  } else {\n                    document.documentElement.classList.remove('light');\n                    document.documentElement.classList.add('dark');\n                  }\n                } catch (e) {\n                  document.documentElement.classList.add('dark');\n                }\n              })();\n            </script><script src=\"/_next/static/chunks/0cz1d0mv5g_q7.js\" noModule=\"\"></script></head><body class=\"min-h-full flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]\"><div hidden=\"\"><!--$--><!--/$--></div><!--$--><main class=\"min-h-screen grid place-items-center px-6 py-12 bg-[var(--bg-canvas)] text-[var(--text-primary)]\"><section class=\"w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center shadow-sm\"><h1 class=\"text-xl font-semibold\">Opening SpendSense</h1><p class=\"mt-3 text-sm leading-6 text-[var(--text-secondary)]\">Checking this device for your saved SpendSense session…</p></section></main><!--$--><!--/$--><!--/$--><script id=\"_R_\">(globalThis[\"TURBOPACK\"] || (globalThis[\"TURBOPACK\"] = [])).push({\"otherChunks\":[\"static/chunks/2jrzzxb_x3x3y.js\",\"static/chunks/0vvlqi-iws1v8.js\",\"static/chunks/3ik6eb4581tqy.js\",\"static/chunks/3x6s8h7slpat3.js\",\"static/chunks/3rpb0_y559jil.js\"],\"runtimeModuleIds\":[67964]});</script><script src=\"/_next/static/chunks/2jrzzxb_x3x3y.js\" async=\"\"></script><script>(self.__next_f=self.__next_f||[]).push([0])</script><script>self.__next_f.push([1,\"1:\\\"/_next/static/chunks/0qrvlo-a__l4x.js\\\"\\n2:\\\"LoadingBoundaryProvider\\\"\\n3:I[77763,[\\\"$1\\\"],\\\"$2\\\"]\\n4:\\\"/_next/static/chunks/3bny2dbjkigll.js\\\"\\n5:\\\"DashboardSkeleton\\\"\\n6:I[12222,[\\\"$1\\\",\\\"$4\\\"],\\\"$5\\\"]\\n7:\\\"$Sreact.fragment\\\"\\n10:I[60223,[\\\"$1\\\"],\\\"default\\\",1]\\n:HL[\\\"/_next/static/chunks/3c1bu-3h4pdyk.css\\\",\\\"style\\\"]\\n:HL[\\\"/_next/static/media/07a39a8a4660cc7c-s.p.0r6juujl39pe6.woff2\\\",\\\"font\\\",{\\\"crossOrigin\\\":\\\"\\\",\\\"type\\\":\\\"font/woff2\\\"}]\\n:HL[\\\"/_next/static/media/07c7676b89ed2778-s.p.2bn3s6zvc0dyp.woff2\\\",\\\"font\\\",{\\\"crossOrigin\\\":\\\"\\\",\\\"type\\\":\\\"font/woff2\\\"}]\\nc:X\\nd:[[\\\"children\\\",{\\\"s\\\":\\\"__PAGE__\\\",\\\"h\\\":512,\\\"d\\\":{\\\"r\\\":\\\"$Le\\\",\\\"p\\\":false,\\\"v\\\":null}}]]\\na:[[\\\"children\\\",{\\\"s\\\":\\\"offline\\\",\\\"h\\\":512,\\\"d\\\":{\\\"r\\\":\\\"$Lb\\\",\\\"p\\\":false,\\\"v\\\":\\\"$c\\\"},\\\"c\\\":\\\"$Qd\\\"}]]\\n0:{\\\"P\\\":null,\\\"c\\\":[\\\"\\\",\\\"offline\\\"],\\\"q\\\":\\\"\\\",\\\"i\\\":false,\\\"t\\\":{\\\"t\\\":{\\\"s\\\":\\\"\\\",\\\"h\\\":532,\\\"d\\\":{\\\"r\\\":[\\\"$\\\",\\\"$L3\\\",null,{\\\"loading\\\":[[\\\"$\\\",\\\"div\\\",\\\"l\\\",{\\\"role\\\":\\\"status\\\",\\\"aria-label\\\":\\\"Loading SpendSense\\\",\\\"className\\\":\\\"min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-12 transition-colors select-none\\\",\\\"children\\\":[[\\\"$\\\",\\\"header\\\",null,{\\\"className\\\":\\\"sticky top-0 z-30 bg-[var(--bg-canvas)]/90 backdrop-blur-xs border-b border-[var(--border-hairline)] px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5\\\",\\\"children\\\":[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"max-w-7xl 2xl:max-w-[1440px] mx-auto flex items-center justify-between\\\",\\\"children\\\":[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"flex items-center gap-3 sm:gap-4 min-w-0\\\",\\\"children\\\":[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"flex items-center gap-2 sm:gap-2.5\\\",\\\"children\\\":[[\\\"$\\\",\\\"svg\\\",null,{\\\"xmlns\\\":\\\"http://www.w3.org/2000/svg\\\",\\\"viewBox\\\":\\\"0 0 640 160\\\",\\\"fill\\\":\\\"currentColor\\\",\\\"role\\\":\\\"img\\\",\\\"aria-label\\\":\\\"SpendSense\\\",\\\"className\\\":\\\"inline-block shrink-0 transition-colors h-6 sm:h-7 w-auto max-w-[110px] sm:max-w-[130px] text-[var(--text-primary)] opacity-85\\\",\\\"children\\\":[[\\\"$\\\",\\\"title\\\",null,{\\\"children\\\":\\\"SpendSense\\\"}],[[\\\"$\\\",\\\"path\\\",null,{\\\"d\\\":\\\"M 119 35 C 105 21 89 15 69 15 C 39 15 19 31 19 54 C 19 76 34 87 62 94 L 84 100 C 103 105 112 113 112 126 C 112 143 96 154 72 154 C 50 154 32 146 18 131\\\",\\\"fill\\\":\\\"none\\\",\\\"stroke\\\":\\\"currentColor\\\",\\\"strokeWidth\\\":\\\"15\\\",\\\"strokeLinecap\\\":\\\"round\\\",\\\"strokeLinejoin\\\":\\\"round\\\"}],[\\\"$\\\",\\\"path\\\",null,{\\\"d\\\":\\\"M 49 104 H 111\\\",\\\"stroke\\\":\\\"#10B981\\\",\\\"strokeWidth\\\":\\\"7\\\",\\\"strokeLinecap\\\":\\\"round\\\"}],[\\\"$\\\",\\\"text\\\",null,{\\\"x\\\":\\\"190\\\",\\\"y\\\":\\\"108\\\",\\\"fill\\\":\\\"currentColor\\\",\\\"fontFamily\\\":\\\"Inter, Arial, sans-serif\\\",\\\"fontSize\\\":\\\"72\\\",\\\"fontWeight\\\":\\\"600\\\",\\\"letterSpacing\\\":\\\"-2\\\",\\\"children\\\":\\\"SpendSense\\\"}]]]}],[\\\"$\\\",\\\"span\\\",null,{\\\"className\\\":\\\"text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold px-1.5 sm:px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0\\\",\\\"children\\\":\\\"Ledger\\\"}]]}]}]}]}],[\\\"$\\\",\\\"main\\\",null,{\\\"className\\\":\\\"max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6\\\",\\\"children\\\":[\\\"$\\\",\\\"$L6\\\",null,{}]}],[\\\"$\\\",\\\"nav\\\",null,{\\\"aria-hidden\\\":\\\"true\\\",\\\"className\\\":\\\"md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-canvas)]/95 backdrop-blur-md border-t border-[var(--border-hairline)] px-3 py-2 flex justify-around items-center\\\",\\\"children\\\":[[\\\"$\\\",\\\"div\\\",\\\"0\\\",{\\\"className\\\":\\\"flex flex-col items-center gap-1.5 py-1 px-3\\\",\\\"children\\\":[[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)] animate-pulse\\\"}],[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)] animate-pulse\\\"}]]}],[\\\"$\\\",\\\"div\\\",\\\"1\\\",{\\\"className\\\":\\\"flex flex-col items-center gap-1.5 py-1 px-3\\\",\\\"children\\\":[[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)] animate-pulse\\\"}],[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)] animate-pulse\\\"}]]}],[\\\"$\\\",\\\"div\\\",\\\"2\\\",{\\\"className\\\":\\\"flex flex-col items-center gap-1.5 py-1 px-3\\\",\\\"children\\\":[[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)] animate-pulse\\\"}],[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)] animate-pulse\\\"}]]}],[\\\"$\\\",\\\"div\\\",\\\"3\\\",{\\\"className\\\":\\\"flex flex-col items-center gap-1.5 py-1 px-3\\\",\\\"children\\\":[[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)] animate-pulse\\\"}],[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)] animate-pulse\\\"}]]}],[\\\"$\\\",\\\"div\\\",\\\"4\\\",{\\\"className\\\":\\\"flex flex-col items-center gap-1.5 py-1 px-3\\\",\\\"children\\\":[[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-5 h-5 rounded-md bg-[var(--bg-surface-subtle)] animate-pulse\\\"}],[\\\"$\\\",\\\"div\\\",null,{\\\"className\\\":\\\"w-8 h-2 rounded-xs bg-[var(--bg-surface-subtle)] animate-pulse\\\"}]]}]]}]]}],[],[[\\\"$\\\",\\\"script\\\",\\\"script-0\\\",{\\\"src\\\":\\\"/_next/static/chunks/3bny2dbjkigll.js\\\",\\\"async\\\":true,\\\"nonce\\\":\\\"$undefined\\\"}]]],\\\"children\\\":[\\\"$\\\",\\\"$7\\\",\\\"c\\\",{\\\"children\\\":[[[\\\"$\\\",\\\"link\\\",\\\"0\\\",{\\\"rel\\\":\\\"stylesheet\\\",\\\"href\\\":\\\"/_next/static/chunks/3c1bu-3h4pdyk.css\\\",\\\"precedence\\\":\\\"next\\\",\\\"crossOrigin\\\":\\\"$undefined\\\",\\\"nonce\\\":\\\"$undefined\\\"}],\\\"$L8\\\"],\\\"$L9\\\"]}]}],\\\"p\\\":false,\\\"v\\\":null},\\\"c\\\":\\\"$Qa\\\"},\\\"h\\\":{\\\"r\\\":\\\"$Lf\\\",\\\"p\\\":false,\\\"v\\\":null}},\\\"m\\\":\\\"$undefined\\\",\\\"G\\\":[\\\"$10\\\",[\\\"$L11\\\"]],\\\"S\\\":true,\\\"r\\\":\\\"$undefined\\\",\\\"s\\\":\\\"$undefined\\\",\\\"a\\\":\\\"$undefined\\\",\\\"l\\\":\\\"$undefined\\\",\\\"p\\\":\\\"$undefined\\\",\\\"d\\\":\\\"$undefined\\\",\\\"b\\\":\\\"cSVhLVXIl-5DPcZLqG02G\\\"}\\n12:\\\"PwaRuntimeManager\\\"\\n13:I[61429,[\\\"$1\\\"],\\\"$12\\\"]\\n14:\\\"BackNavigationProvider\\\"\\n15:I[81079,[\\\"$1\\\"],\\\"$14\\\"]\\n16:I[77763,[\\\"$1\\\"],\\\"default\\\"]\\n17:I[92580,[\\\"$1\\\"],\\\"default\\\"]\\n18:\\\"/_next/static/chunks/37ipnqb3nxtuf.js\\\"\\n19:\\\"/_next/static/chunks/2c66hd8759yti.js\\\"\\n1a:\\\"/_next/static/chunks/3kxkkqwfpsz11.js\\\"\\n1b:\\\"/_next/static/chunks/2s7wiw8l42su2.js\\\"\\n1c:I[11774,[\\\"$1\\\",\\\"$18\\\",\\\"$19\\\",\\\"$1a\\\",\\\"$1b\\\"],\\\"OfflinePwaEntry\\\"]\\n1d:I[42948,[\\\"$1\\\"],\\\"OutletBoundary\\\"]\\n1e:\\\"$Sreact.suspense\\\"\\n20:\\\"ViewportBoundary\\\"\\n21:I[42948,[\\\"$1\\\"],\\\"$20\\\"]\\n23:\\\"MetadataBoundary\\\"\\n24:I[42948,[\\\"$1\\\"],\\\"$23\\\"]\\n8:[\\\"$\\\",\\\"script\\\",\\\"script-0\\\",{\\\"src\\\":\\\"/_next/static/chunks/0qrvlo-a__l4x.js\\\",\\\"async\\\":true,\\\"nonce\\\":\\\"$undefined\\\"}]\\n9:[\\\"$\\\",\\\"html\\\",null,{\\\"lang\\\":\\\"en\\\",\\\"className\\\":\\\"MOT0tq_variable FlyLvG_variable h-full antialiased\\\",\\\"suppressHydrationWarning\\\":true,\\\"children\\\":[[\\\"$\\\",\\\"head\\\",null,{\\\"children\\\":[\\\"$\\\",\\\"script\\\",null,{\\\"dangerouslySetInnerHTML\\\":{\\\"__html\\\":\\\"\\\\n              (function() {\\\\n                try {\\\\n                  var saved = localStorage.getItem('theme');\\\\n                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;\\\\n                  if (saved === 'light') {\\\\n                    document.documentElement.classList.remove('dark');\\\\n                    document.documentElement.classList.add('light');\\\\n                  } else {\\\\n                    document.documentElement.classList.remove('light');\\\\n                    document.documentElement.classList.add('dark');\\\\n                  }\\\\n                } catch (e) {\\\\n                  document.documentElement.classList.add('dark');\\\\n                }\\\\n              })();\\\\n            \\\"}}]}],[\\\"$\\\",\\\"body\\\",null,{\\\"className\\\":\\\"min-h-full flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]\\\",\\\"children\\\":[[\\\"$\\\",\\\"$L13\\\",null,{}],[\\\"$\\\",\\\"$L15\\\",null,{\\\"children\\\":[\\\"$\\\",\\\"$L16\\\",null,{\\\"parallelRouterKey\\\":\\\"children\\\",\\\"error\\\":\\\"$undefined\\\",\\\"errorStyles\\\":\\\"$undefined\\\",\\\"errorScripts\\\":\\\"$undefined\\\",\\\"template\\\":[\\\"$\\\",\\\"$L17\\\",null,{}],\\\"templateStyles\\\":\\\"$undefined\\\",\\\"templateScripts\\\":\\\"$undefined\\\",\\\"notFound\\\":[[[\\\"$\\\",\\\"title\\\",null,{\\\"children\\\":\\\"404: This page could not be found.\\\"}],[\\\"$\\\",\\\"div\\\",null,{\\\"style\\\":{\\\"fontFamily\\\":\\\"system-ui,\\\\\\\"Segoe UI\\\\\\\",Roboto,Helvetica,Arial,sans-serif,\\\\\\\"Apple Color Emoji\\\\\\\",\\\\\\\"Segoe UI Emoji\\\\\\\"\\\",\\\"height\\\":\\\"100vh\\\",\\\"textAlign\\\":\\\"center\\\",\\\"display\\\":\\\"flex\\\",\\\"flexDirection\\\":\\\"column\\\",\\\"alignItems\\\":\\\"center\\\",\\\"justifyContent\\\":\\\"center\\\"},\\\"children\\\":[\\\"$\\\",\\\"div\\\",null,{\\\"children\\\":[[\\\"$\\\",\\\"style\\\",null,{\\\"dangerouslySetInnerHTML\\\":{\\\"__html\\\":\\\"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}\\\"}}],[\\\"$\\\",\\\"h1\\\",null,{\\\"className\\\":\\\"next-error-h1\\\",\\\"style\\\":{\\\"display\\\":\\\"inline-block\\\",\\\"margin\\\":\\\"0 20px 0 0\\\",\\\"padding\\\":\\\"0 23px 0 0\\\",\\\"fontSize\\\":24,\\\"fontWeight\\\":500,\\\"verticalAlign\\\":\\\"top\\\",\\\"lineHeight\\\":\\\"49px\\\"},\\\"children\\\":404}],[\\\"$\\\",\\\"div\\\",null,{\\\"style\\\":{\\\"display\\\":\\\"inline-block\\\"},\\\"children\\\":[\\\"$\\\",\\\"h2\\\",null,{\\\"style\\\":{\\\"fontSize\\\":14,\\\"fontWeight\\\":400,\\\"lineHeight\\\":\\\"49px\\\",\\\"margin\\\":0},\\\"children\\\":\\\"This page could not be found.\\\"}]}]]}]}]],[]],\\\"forbidden\\\":\\\"$undefined\\\",\\\"unauthorized\\\":\\\"$undefined\\\"}]}]]}]]}]\\nb:[\\\"$\\\",\\\"$7\\\",\\\"c\\\",{\\\"children\\\":[null,[\\\"$\\\",\\\"$L16\\\",null,{\\\"parallelRouterKey\\\":\\\"children\\\",\\\"error\\\":\\\"$undefined\\\",\\\"errorStyles\\\":\\\"$undefined\\\",\\\"errorScripts\\\":\\\"$undefined\\\",\\\"template\\\":[\\\"$\\\",\\\"$L17\\\",null,{}],\\\"templateStyles\\\":\\\"$undefined\\\",\\\"templateScripts\\\":\\\"$undefined\\\",\\\"notFound\\\":\\\"$undefined\\\",\\\"forbidden\\\":\\\"$undefined\\\",\\\"unauthorized\\\":\\\"$undefined\\\"}]]}]\\ne:[\\\"$\\\",\\\"$7\\\",\\\"c\\\",{\\\"children\\\":[[\\\"$\\\",\\\"$L1c\\\",null,{}],[[\\\"$\\\",\\\"script\\\",\\\"script-0\\\",{\\\"src\\\":\\\"/_next/static/chunks/37ipnqb3nxtuf.js\\\",\\\"async\\\":true,\\\"nonce\\\":\\\"$undefined\\\"}],[\\\"$\\\",\\\"script\\\",\\\"script-1\\\",{\\\"src\\\":\\\"/_next/static/chunks/2c66hd8759yti.js\\\",\\\"async\\\":true,\\\"nonce\\\":\\\"$undefined\\\"}],[\\\"$\\\",\\\"script\\\",\\\"script-2\\\",{\\\"src\\\":\\\"/_next/static/chunks/3kxkkqwfpsz11.js\\\",\\\"async\\\":true,\\\"nonce\\\":\\\"$undefined\\\"}],[\\\"$\\\",\\\"script\\\",\\\"script-3\\\",{\\\"src\\\":\\\"/_next/static/chunks/2s7wiw8l42su2.js\\\",\\\"async\\\":true,\\\"nonce\\\":\\\"$undefined\\\"}]],[\\\"$\\\",\\\"$L1d\\\",null,{\\\"children\\\":[\\\"$\\\",\\\"$1e\\\",null,{\\\"name\\\":\\\"Next.MetadataOutlet\\\",\\\"children\\\":\\\"$@1f\\\"}]}]]}]\\nf:[\\\"$\\\",\\\"$7\\\",\\\"h\\\",{\\\"children\\\":[null,[\\\"$\\\",\\\"$L21\\\",null,{\\\"children\\\":\\\"$L22\\\"}],[\\\"$\\\",\\\"$L24\\\",null,{\\\"children\\\":[[\\\"$\\\",\\\"div\\\",null,{\\\"hidden\\\":true,\\\"children\\\":[\\\"$\\\",\\\"$1e\\\",null,{\\\"name\\\":\\\"Next.Metadata\\\",\\\"children\\\":\\\"$L25\\\"}]}],null]}],[\\\"$\\\",\\\"meta\\\",null,{\\\"name\\\":\\\"next-size-adjust\\\",\\\"content\\\":\\\"\\\"}]]}]\\n11:[\\\"$\\\",\\\"link\\\",\\\"0\\\",{\\\"rel\\\":\\\"stylesheet\\\",\\\"href\\\":\\\"/_next/static/chunks/3c1bu-3h4pdyk.css\\\",\\\"precedence\\\":\\\"next\\\",\\\"crossOrigin\\\":\\\"$undefined\\\",\\\"nonce\\\":\\\"$undefined\\\"}]\\nc:C\\n22:[[\\\"$\\\",\\\"meta\\\",\\\"0\\\",{\\\"charSet\\\":\\\"utf-8\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"1\\\",{\\\"name\\\":\\\"viewport\\\",\\\"content\\\":\\\"width=device-width, initial-scale=1, viewport-fit=cover\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"2\\\",{\\\"name\\\":\\\"theme-color\\\",\\\"content\\\":\\\"#FBFBF9\\\",\\\"media\\\":\\\"(prefers-color-scheme: light)\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"3\\\",{\\\"name\\\":\\\"theme-color\\\",\\\"content\\\":\\\"#0C0A09\\\",\\\"media\\\":\\\"(prefers-color-scheme: dark)\\\"}]]\\n26:I[25250,[\\\"$1\\\"],\\\"IconMark\\\"]\\n1f:null\\n25:[[\\\"$\\\",\\\"title\\\",\\\"0\\\",{\\\"children\\\":\\\"SpendSense — Personal Finance\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"1\\\",{\\\"name\\\":\\\"description\\\",\\\"content\\\":\\\"A clear, private-first personal finance workspace for tracking Indian income and spending, reviewing transactions, and organizing financial documents.\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"2\\\",{\\\"name\\\":\\\"application-name\\\",\\\"content\\\":\\\"SpendSense\\\"}],[\\\"$\\\",\\\"link\\\",\\\"3\\\",{\\\"rel\\\":\\\"manifest\\\",\\\"href\\\":\\\"/manifest.webmanifest\\\",\\\"crossOrigin\\\":\\\"$undefined\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"4\\\",{\\\"name\\\":\\\"mobile-web-app-capable\\\",\\\"content\\\":\\\"yes\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"5\\\",{\\\"name\\\":\\\"apple-mobile-web-app-title\\\",\\\"content\\\":\\\"SpendSense\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"6\\\",{\\\"name\\\":\\\"apple-mobile-web-app-status-bar-style\\\",\\\"content\\\":\\\"default\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"7\\\",{\\\"property\\\":\\\"og:title\\\",\\\"content\\\":\\\"SpendSense — Personal Finance\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"8\\\",{\\\"property\\\":\\\"og:description\\\",\\\"content\\\":\\\"Track income and spending, review transaction suggestions, and organize financial documents.\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"9\\\",{\\\"property\\\":\\\"og:site_name\\\",\\\"content\\\":\\\"SpendSense\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"10\\\",{\\\"property\\\":\\\"og:type\\\",\\\"content\\\":\\\"website\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"11\\\",{\\\"name\\\":\\\"twitter:card\\\",\\\"content\\\":\\\"summary\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"12\\\",{\\\"name\\\":\\\"twitter:title\\\",\\\"content\\\":\\\"SpendSense — Personal Finance\\\"}],[\\\"$\\\",\\\"meta\\\",\\\"13\\\",{\\\"name\\\":\\\"twitter:description\\\",\\\"content\\\":\\\"Track income and spending, review transaction suggestions, and organize financial documents.\\\"}],[\\\"$\\\",\\\"link\\\",\\\"14\\\",{\\\"rel\\\":\\\"icon\\\",\\\"href\\\":\\\"/favicon.ico?favicon.3dad3datm04e6.ico\\\",\\\"sizes\\\":\\\"48x48\\\",\\\"type\\\":\\\"image/x-icon\\\"}],[\\\"$\\\",\\\"link\\\",\\\"15\\\",{\\\"rel\\\":\\\"icon\\\",\\\"href\\\":\\\"/favicon.ico\\\"}],[\\\"$\\\",\\\"link\\\",\\\"16\\\",{\\\"rel\\\":\\\"icon\\\",\\\"href\\\":\\\"/favicon.svg\\\",\\\"type\\\":\\\"image/svg+xml\\\"}],[\\\"$\\\",\\\"link\\\",\\\"17\\\",{\\\"rel\\\":\\\"icon\\\",\\\"href\\\":\\\"/icons/icon-192x192.png\\\",\\\"sizes\\\":\\\"192x192\\\",\\\"type\\\":\\\"image/png\\\"}],[\\\"$\\\",\\\"link\\\",\\\"18\\\",{\\\"rel\\\":\\\"icon\\\",\\\"href\\\":\\\"/icons/icon-512x512.png\\\",\\\"sizes\\\":\\\"512x512\\\",\\\"type\\\":\\\"image/png\\\"}],[\\\"$\\\",\\\"link\\\",\\\"19\\\",{\\\"rel\\\":\\\"apple-touch-icon\\\",\\\"href\\\":\\\"/icons/apple-touch-icon.png\\\",\\\"sizes\\\":\\\"180x180\\\",\\\"type\\\":\\\"image/png\\\"}],[\\\"$\\\",\\\"$L26\\\",\\\"20\\\",{}]]\\n\"])</script></body></html>";
const RUNTIME_DB = 'arth_sw_runtime_v1';
const RUNTIME_DB_VERSION = 1;

function openRuntimeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RUNTIME_DB, RUNTIME_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRuntime(storeName, value) {
  const db = await openRuntimeDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getRuntime(storeName, key) {
  const db = await openRuntimeDb();
  const value = await new Promise((resolve) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
  db.close();
  return value;
}

async function getClientMode(clientId) {
  if (!clientId) return null;
  try {
    const record = await getRuntime('clients', clientId);
    return record?.runtimeMode || null;
  } catch {
    return null;
  }
}

function isMobileUserAgent() {
  const hints = self.navigator.userAgentData;
  if (hints && typeof hints.mobile === 'boolean') return hints.mobile;
  return /android|iphone|ipad|ipod|mobile/i.test(self.navigator.userAgent || '');
}

function offlineHtml(title, message, retry = true) {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0D0D0F"><title>' + title + '</title><style>body{margin:0;background:#0D0D0F;color:#F5F5F4;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}.card{width:min(100%,380px);background:#141416;border:1px solid #333;border-radius:16px;padding:28px 24px;text-align:center}p{font-size:14px;color:#bbb;line-height:1.55}button{margin-top:12px;background:#fff;color:#000;border:0;border-radius:8px;padding:10px 18px;font-weight:600}</style></head><body><main class="card"><h1>' + title + '</h1><p>' + message + '</p>' + (retry ? '<button onclick="location.reload()">Try again</button>' : '') + '</main></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.add(new Request('/offline', { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] Could not precache /offline directly:', err);
      }
      try {
        await cache.addAll(PRECACHE_ASSETS);
      } catch (err) {
        console.warn('[sw] Precache batch failed, attempting resilient caching:', err);
        await Promise.allSettled(
          PRECACHE_ASSETS.map((asset) =>
            cache.add(new Request(asset, { cache: 'reload' })).catch(() => {})
          )
        );
      }
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: SW_VERSION, cacheName: CACHE_NAME });
  if (data.type === 'CLASSIFY_CLIENT' && event.source?.id) {
    const allowed = ['desktop-web', 'mobile-web', 'installed-mobile-pwa'];
    if (allowed.includes(data.runtimeMode)) {
      event.waitUntil(storeRuntime('clients', { id: event.source.id, runtimeMode: data.runtimeMode, updatedAt: Date.now() }));
    }
  }
  if (data.type === 'PWA_PREPARED') event.waitUntil(storeRuntime('state', { key: 'pwa-prepared', value: true }));
  if (data.type === 'PWA_SIGNED_OUT') event.waitUntil(storeRuntime('state', { key: 'pwa-prepared', value: false }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('arth-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let mode = await getClientMode(event.clientId);
      const startUrlSignal = (url.pathname === '/offline' || url.searchParams.get('arth_runtime') === 'installed-mobile-pwa') && isMobileUserAgent();
      if (startUrlSignal) mode = 'installed-mobile-pwa';
      try {
        const response = await fetch(request);
        // Never cache authenticated or personalized navigation responses.
        if (startUrlSignal && event.resultingClientId) {
          await storeRuntime('clients', { id: event.resultingClientId, runtimeMode: 'installed-mobile-pwa', updatedAt: Date.now() });
        }
        return response;
      } catch {
        if (!mode && isMobileUserAgent()) {
          const prepared = await getRuntime('state', 'pwa-prepared').catch(() => null);
          if (prepared?.value) mode = 'installed-mobile-pwa';
        }
        if (mode === 'installed-mobile-pwa' && isMobileUserAgent()) {
          const cached =
            (await caches.open(CACHE_NAME).then((cache) => cache.match('/offline')).catch(() => null)) ||
            (await caches.match('/offline')) ||
            (await caches.match('/offline.html'));
          if (cached) return cached;
          if (FALLBACK_OFFLINE_HTML) {
            return new Response(FALLBACK_OFFLINE_HTML, {
              headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
            });
          }
          return offlineHtml('SpendSense is offline', 'The authenticated app shell is not cached on this device. Reconnect to open SpendSense; previously loaded financial records remain stored locally and will sync when online.');
        }
        return offlineHtml('Connection required', 'This web session needs an internet connection. Check your connection and try again.');
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/fonts/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = fetch(request).then((response) => {
        if (response.ok) void cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || update;
    })());
  }
});
