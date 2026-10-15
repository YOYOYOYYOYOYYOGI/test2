const paths: Record<string, string> = {
  compass:
    '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1 5.1-2.5Z"/>',
  creatures:
    '<path d="M12 20c-4 0-7-3-7-6 0-2 1-3 3-3l1-5 3 3 3-3 1 5c2 0 3 1 3 3 0 3-3 6-7 6Z"/><path d="M9 14h.01M15 14h.01"/>',
  satchel:
    '<path d="M5 9h14l1 11H4L5 9Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3M9 14h6"/>',
  journal:
    '<path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4Z"/><path d="M4 17c0-1 1-2 2-2h13M8 8h7M8 11h5"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14M15 6v14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cross: '<path d="M5 5 19 19M19 5 5 19"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  heart:
    '<path d="M20.4 8.6c0 4-8.4 9.6-8.4 9.6S3.6 12.6 3.6 8.6a4.1 4.1 0 0 1 8.4-1 4.1 4.1 0 0 1 8.4 1Z"/>',
  sparkle:
    '<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/>',
  sound:
    '<path d="M4 9v6h4l5 4V5L8 9H4ZM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  save: '<path d="M4 3h14l3 3v15H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-3-2-6 0-6 2 0 3 6 1 6 4 0 2-3 4-6 1M12 6v12"/>',
};
export function icon(name: string, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
}
export function esc(text: unknown): string {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}
