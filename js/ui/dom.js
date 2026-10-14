// Tiny DOM helpers shared by the views.

import { ICONS, ICON_VIEWBOX } from './icons.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

export function icon(name, className = '') {
  return `<svg class="ico ${className}" viewBox="${ICON_VIEWBOX}" aria-hidden="true" fill="currentColor">${ICONS[name] || ''}</svg>`;
}

export const $ = (selector, root = document) => root.querySelector(selector);

/** iOS-style segmented control; clicks carry data-seg / data-value. */
export function segmented(group, options, active) {
  const index = Math.max(0, options.findIndex((option) => option.id === active));
  return `<div class="seg" role="tablist" style="--n:${options.length};--i:${index}">
    <span class="seg-thumb" aria-hidden="true"></span>
    ${options.map((option) => `<button type="button" role="tab" aria-selected="${option.id === active}"
      data-seg="${group}" data-value="${option.id}">${esc(option.label)}</button>`).join('')}
  </div>`;
}

/** Activity-style ring (0–100), coloured by the --ring custom property. */
export function ring(pct, size = 92, stroke = 11) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const value = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"/>
    <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
      stroke-dasharray="${length}" stroke-dashoffset="${length * (1 - value / 100)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

let toastTimer = null;
export function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => { node.hidden = true; }, 300);
  }, 2600);
}
