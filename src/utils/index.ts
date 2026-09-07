let counter = 0;
export const uid = (prefix = ''): string =>
  prefix + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 8);

export const money = (n: number): string => '₹' + n.toLocaleString('en-IN');

export const todayStr = (): string => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export const fmtDate = (iso: string): string => (iso ? iso.slice(0, 10) : '');

export const isValidPhone = (v: string): boolean => /^[+\d][\d\s-]{5,19}$/.test(v.trim());

export const isValidEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
