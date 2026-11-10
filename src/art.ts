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
  { name: "pig", art: `<path d="M14 24q-2-12 8-12 4 3 5 10zM50 24q2-12-8-12-4 3-5 10z" fill="#ff9fb3"/><circle cx="32" cy="36" r="21" fill="#ffb8c6"/><ellipse cx="32" cy="42" rx="9" ry="7" fill="#ff8fa6"/><circle cx="28.500" cy="42" r="1.800" fill="#c2455f"/><circle cx="35.500" cy="42" r="1.800" fill="#c2455f"/>${eye(23, 32)}${eye(41, 32)}<circle cx="16" cy="40" r="3.600" fill="#ff7b96" opacity=".45"/><circle cx="48" cy="40" r="3.600" fill="#ff7b96" opacity=".45"/>` },
  { name: "lion", art: `<circle cx="32" cy="34" r="27" fill="#d9822b"/><circle cx="15" cy="17" r="6" fill="#f2a742"/><circle cx="49" cy="17" r="6" fill="#f2a742"/><circle cx="32" cy="36" r="18" fill="#ffd28a"/>${eye(25, 33)}${eye(39, 33)}<path d="M29 39h6l-3 3.400z" fill="#8a4b12"/><path d="M26 45q6 5 12 0" fill="none" stroke="#8a4b12" stroke-width="2" stroke-linecap="round"/><circle cx="21" cy="41" r="3" fill="#ff9aa8" opacity=".5"/><circle cx="43" cy="41" r="3" fill="#ff9aa8" opacity=".5"/>` },
  { name: "mouse", art: `<circle cx="14" cy="18" r="11" fill="#b9bfcc"/><circle cx="50" cy="18" r="11" fill="#b9bfcc"/><circle cx="14" cy="18" r="6.500" fill="#ffb3c1"/><circle cx="50" cy="18" r="6.500" fill="#ffb3c1"/><path d="M12 38c0-13 9-19 20-19s20 6 20 19c0 9-9 17-20 17S12 47 12 38z" fill="#d5d9e2"/>${eye(24, 35)}${eye(40, 35)}<ellipse cx="32" cy="43" rx="3" ry="2.400" fill="#ff8fa3"/><path d="M28 47q4 3.600 8 0" fill="none" stroke="#2d2230" stroke-width="2" stroke-linecap="round"/><path d="M8 41l11 2M8 47l11-2M56 41l-11 2M56 47l-11-2" stroke="#8d94a5" stroke-width="1.300" stroke-linecap="round"/>` },
  { name: "tiger", art: `<circle cx="15" cy="16" r="8" fill="#ff9d2e"/><circle cx="49" cy="16" r="8" fill="#ff9d2e"/><circle cx="15" cy="16" r="4" fill="#fff"/><circle cx="49" cy="16" r="4" fill="#fff"/><circle cx="32" cy="36" r="22" fill="#ff9d2e"/><path d="M32 15v8M24 17l2 7M40 17l-2 7M11 30l8 2M11 38l8 0M53 30l-8 2M53 38l-8 0" stroke="#2d2230" stroke-width="2.400" stroke-linecap="round"/><ellipse cx="32" cy="44" rx="11" ry="8" fill="#fff"/>${eye(23, 33)}${eye(41, 33)}<path d="M29 41h6l-3 3z" fill="#2d2230"/><path d="M28 47q4 3.600 8 0" fill="none" stroke="#2d2230" stroke-width="2" stroke-linecap="round"/>` },
  { name: "owl", art: `<path d="M12 14l10 8M52 14l-10 8" stroke="#8a5a34" stroke-width="5" stroke-linecap="round"/><ellipse cx="32" cy="36" rx="22" ry="23" fill="#b07a4b"/><circle cx="23" cy="31" r="10.500" fill="#fff"/><circle cx="41" cy="31" r="10.500" fill="#fff"/><circle cx="24" cy="32" r="5.500" fill="#2d2230"/><circle cx="40" cy="32" r="5.500" fill="#2d2230"/><circle cx="25.800" cy="30" r="1.800" fill="#fff"/><circle cx="41.800" cy="30" r="1.800" fill="#fff"/><path d="M28 40h8l-4 7z" fill="#ffb02e"/><path d="M20 52q12 6 24 0" fill="none" stroke="#8a5a34" stroke-width="2" stroke-linecap="round"/>` },
  { name: "penguin", art: `<ellipse cx="32" cy="35" rx="23" ry="24" fill="#2f3a52"/><path d="M14 36c0-12 8-18 18-18s18 6 18 18c0 10-8 19-18 19S14 46 14 36z" fill="#fff"/><circle cx="24" cy="32" r="3.200" fill="#2d2230"/><circle cx="40" cy="32" r="3.200" fill="#2d2230"/><circle cx="25" cy="31" r="1.100" fill="#fff"/><circle cx="41" cy="31" r="1.100" fill="#fff"/><path d="M27 38h10l-5 6z" fill="#ffb02e"/><circle cx="19" cy="40" r="3.400" fill="#ff9aa8" opacity=".55"/><circle cx="45" cy="40" r="3.400" fill="#ff9aa8" opacity=".55"/>` },
];
/** the first six are the ones given out by default (by the child's id); all of them can be chosen as an avatar */
const DEFAULT_ANIMALS = 6;
export const ANIMAL_NAMES = ANIMALS.map((x) => x.name);
export const ANIMAL_COUNT = ANIMALS.length;

/** the same child always gets the same animal (from the child's id) */
export function animalIndex(id: string): number {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n % DEFAULT_ANIMALS;
}
/** a named animal (see ANIMAL_NAMES); an unknown name gives the first one */
export const animalNamed = (name: string) => svg(ANIMALS.find((x) => x.name === name)?.art ?? ANIMALS[0].art, name);
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
