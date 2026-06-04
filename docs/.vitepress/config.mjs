import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

// VitePress config for the warp-math docs site.
//
// base = '/warp-markers/' because this deploys to GitHub project Pages at
// https://naomiaro.github.io/warp-markers/. A wrong base is the most common
// cause of broken Pages CSS/JS, so this matches the repo name exactly.
//
// markdown: { math: true } enables KaTeX so the integrals render as real
// math, not ASCII; '$dβ/dt = BPM/60$' and the display-math `$$...$$` blocks
// in the chapter pages are typeset properly.
// `withMermaid` wraps defineConfig and adds a custom Markdown fence
// renderer for ```mermaid blocks. The diagram is rendered client-side by
// mermaid.js after hydration, so it doesn't break SSR.
export default withMermaid(defineConfig({
  base: "/warp-markers/",
  title: "warp-math",
  description:
    "The math behind tempo maps and warp markers: an integral, made visible, made audible.",
  cleanUrls: true,

  markdown: {
    math: true,
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "01 The integral", link: "/01-the-integral" },
      { text: "02 Visualising", link: "/02-visualising" },
      { text: "03 Real audio", link: "/03-real-audio" },
      { text: "04 Meter", link: "/04-meter" },
      { text: "05 Messy data", link: "/05-messy-data" },
    ],
    sidebar: [
      {
        text: "warp-math",
        items: [
          { text: "Home", link: "/" },
          { text: "01 The integral", link: "/01-the-integral" },
          { text: "02 Visualising the warp", link: "/02-visualising" },
          { text: "03 Real audio", link: "/03-real-audio" },
          { text: "04 Meter is not tempo", link: "/04-meter" },
          { text: "05 When the data is messy", link: "/05-messy-data" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/naomiaro/warp-markers" },
    ],
    outline: { level: [2, 3] },
  },

  // The .generated/ directory holds Markdown partials extracted from the
  // chapter source comments by docs/scripts/extract-derivations.mjs. We
  // exclude its files from VitePress's own page discovery; they are only
  // ever included via <!--@include--> directives from the chapter pages.
  srcExclude: [".generated/**"],

  // The standalone chapter demos live at /warp-markers/demos/<chapter>/,
  // served as plain HTML from docs/public/demos/. In the chapter pages
  // we link to them with raw HTML <a target="_blank">, so VitePress's
  // SPA router (which would 404 on routes it doesn't know about) is
  // bypassed -- the link opens in a new tab as a full page load. The
  // dead-link check also has to be told the path is intentional.
  ignoreDeadLinks: [/^\/warp-markers\/demos\//],

  // Mermaid theming. `htmlLabels: false` makes labels render as SVG <text>
  // (instead of HTML <foreignObject>), so they scale uniformly with the
  // diagram when the page narrows -- HTML labels keep their pixel size
  // while the SVG viewBox shrinks, causing right-edge clipping in the
  // grey arrow-label boxes. Use "\n" in labels for line breaks; HTML tags
  // (<br/>, <i>) won't render with this setting.
  mermaid: {
    theme: "default",
    flowchart: { htmlLabels: false, useMaxWidth: true },
  },
}));
