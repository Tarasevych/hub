// QA 12.10 №12: «Надіслати» лише з правильними адресами (name@domain або «Ім'я <name@domain>», через кому/крапку з комою).
const adresGeldig = (deel: string) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(deel) || /^[^<>]*<\s*[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}\s*>$/.test(deel);
export const adressenGeldig = (waarde: string) => { const delen = waarde.split(/[,;]/).map((d) => d.trim()).filter(Boolean); return delen.length > 0 && delen.every(adresGeldig); };
