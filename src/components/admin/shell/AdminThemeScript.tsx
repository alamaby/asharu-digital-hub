/**
 * Inline anti-flash script untuk tema admin. Dipasang sedekat mungkin dengan
 * awal `<body>`; membaca `localStorage` (fallback preferensi OS) dan menambah
 * kelas `dark` sebelum paint pertama. Mismatch atribut `class` di `<html>`
 * saat hydration diredam via `suppressHydrationWarning` di locale layout.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("asharu-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export function AdminThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
