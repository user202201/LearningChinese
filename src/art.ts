/** Drawn artwork (inline SVG, no image files, no text, nothing to translate): the animal avatars of the children and the mascot. */

const svg = (inner: string, label: string) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 64 64");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  s.dataset.art = label;
  s.innerHTML = inner;
  return s;
};
const eye = (x: number, y = 34, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2d2230"/><circle cx="${x + 0.9}" cy="${y - 0.9}" r="${r * 0.35}" fill="#fff"/>`;
const cheeks = `<circle cx="20" cy="42" r="3.6" fill="#ff9aa8" opacity=".55"/><circle cx="44" cy="42" r="3.6" fill="#ff9aa8" opacity=".55"/>`;
const smile = `<path d="M27 43q5 5 10 0" fill="none" stroke="#2d2230" stroke-width="2" stroke-linecap="round"/>`;

/** six animals, drawn to sit on a coloured round background */
const ANIMALS: { name: string; art: string }[] = [
  { name: "cat", art: `<path d="M13 30 15 9l15 9zM51 30 49 9 34 18z" fill="#ffd9a8"/><path d="M17 24l-1-9 8 5zM47 24l1-9-8 5z" fill="#ff9aa8"/><circle cx="32" cy="36" r="21" fill="#ffd9a8"/>${eye(24)}${eye(40)}<path d="M30 39h4l-2 2.4z" fill="#e0707f"/>${smile}${cheeks}<path d="M9 37l9 1.5M9 43l9-1M55 37l-9 1.5M55 43l-9-1" stroke="#b9895a" stroke-width="1.3" stroke-linecap="round"/>` },
  { name: "bear", art: `<circle cx="16" cy="16" r="8" fill="#b9825a"/><circle cx="48" cy="16" r="8" fill="#b9825a"/><circle cx="16" cy="16" r="4" fill="#e8b98f"/><circle cx="48" cy="16" r="4" fill="#e8b98f"/><circle cx="32" cy="36" r="22" fill="#b9825a"/><ellipse cx="32" cy="42" rx="10" ry="8" fill="#f0cfa8"/>${eye(23, 32)}${eye(41, 32)}<ellipse cx="32" cy="39" rx="3.4" ry="2.6" fill="#2d2230"/><path d="M28 44q4 4 8 0" fill="none" stroke="#2d2230" stroke-width="2" stroke-linecap="round"/>` },
  { name: "bunny", art: `<ellipse cx="22" cy="14" rx="6" ry="14" fill="#fff"/><ellipse cx="42" cy="14" rx="6" ry="14" fill="#fff"/><ellipse cx="22" cy="15" rx="3" ry="10" fill="#ffb3c1"/><ellipse cx="42" cy="15" rx="3" ry="10" fill="#ffb3c1"/><circle cx="32" cy="38" r="20" fill="#fff"/>${eye(24, 36)}${eye(40, 36)}<path d="M30 41h4l-2 2.4z" fill="#ff8fa3"/><path d="M28 45q4 4 8 0" fill="none" stroke="#2d2230" stroke-width="2" stroke-linecap="round"/><circle cx="19" cy="43" r="3.6" fill="#ff9aa8" opacity=".55"/><circle cx="45" cy="43" r="3.6" fill="#ff9aa8" opacity=".55"/>` },
  { name: "panda", art: `<circle cx="15" cy="15" r="8" fill="#2d2230"/><circle cx="49" cy="15" r="8" fill="#2d2230"/><circle cx="32" cy="36" r="22" fill="#fff"/><ellipse cx="23" cy="34" rx="6" ry="7.5" fill="#2d2230" transform="rotate(20 23 34)"/><ellipse cx="41" cy="34" rx="6" ry="7.5" fill="#2d2230" transform="rotate(-20 41 34)"/><circle cx="23.5" cy="33.5" r="2.4" fill="#fff"/><circle cx="40.5" cy="33.5" r="2.4" fill="#fff"/><ellipse cx="32" cy="42" rx="3.2" ry="2.4" fill="#2d2230"/><path d="M28 46q4 3.6 8 0" fill="none" stroke="#2d2230" stroke-width="2" stroke-linecap="round"/>` },
  { name: "fox", art: `<path d="M9 30 12 6l17 14zM55 30 52 6 35 20z" fill="#ff8a3d"/><path d="M15 22l1.5-9 7 5.5zM49 22l-1.5-9-7 5.5z" fill="#2d2230"/><path d="M10 34c0-12 10-18 22-18s22 6 22 18c0 10-9 20-22 20S10 44 10 34z" fill="#ff8a3d"/><path d="M12 38c6 1 14 6 20 14 6-8 14-13 20-14-2 11-10 18-20 18S14 49 12 38z" fill="#fff"/>${eye(23, 33)}${eye(41, 33)}<ellipse cx="32" cy="46" rx="3" ry="2.3" fill="#2d2230"/>` },
  { name: "frog", art: `<circle cx="20" cy="18" r="10" fill="#7bd36b"/><circle cx="44" cy="18" r="10" fill="#7bd36b"/><circle cx="20" cy="18" r="6" fill="#fff"/><circle cx="44" cy="18" r="6" fill="#fff"/><circle cx="21" cy="19" r="3" fill="#2d2230"/><circle cx="43" cy="19" r="3" fill="#2d2230"/><ellipse cx="32" cy="38" rx="23" ry="19" fill="#7bd36b"/><path d="M19 42q13 12 26 0" fill="none" stroke="#2d2230" stroke-width="2.2" stroke-linecap="round"/><circle cx="14" cy="42" r="3.6" fill="#ff9aa8" opacity=".6"/><circle cx="50" cy="42" r="3.6" fill="#ff9aa8" opacity=".6"/><circle cx="28" cy="35" r="1.2" fill="#2d2230"/><circle cx="36" cy="35" r="1.2" fill="#2d2230"/>` },
];
export const ANIMAL_COUNT = ANIMALS.length;

/** the same child always gets the same animal (from the child's id) */
export function animalIndex(id: string): number {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n % ANIMALS.length;
}
export const animal = (id: string) => svg(ANIMALS[animalIndex(id)].art, ANIMALS[animalIndex(id)].name);

/** the mascot: a smiling 田字格 square (blinks, bounces a little; see style.css) */
export const mascot = () =>
  svg(
    `<rect x="7" y="9" width="50" height="50" rx="11" fill="#fff" stroke="#f2545b" stroke-width="3.5"/>
     <path d="M32 10v48M8 34h48" stroke="#f7a8a0" stroke-width="1.6" stroke-dasharray="4 3.5"/>
     <g class="eyes">${eye(23, 29, 3.2)}${eye(41, 29, 3.2)}</g>
     <circle cx="17" cy="38" r="4" fill="#ff9aa8" opacity=".6"/><circle cx="47" cy="38" r="4" fill="#ff9aa8" opacity=".6"/>
     <path d="M26 39q6 7 12 0" fill="none" stroke="#2d2230" stroke-width="2.6" stroke-linecap="round"/>
     <path d="M32 9c0-5 3-8 8-8-.5 5-3 8-8 8zM32 9c0-4-2.5-6.5-7-6.5.4 4.200 2.800 6.500 7 6.500z" fill="#51cf66"/>`,
    "mascot",
  );
