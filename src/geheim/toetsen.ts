// Екранна клавіатура для секретів (4.4). Кнопки не мають data-атрибута зі значенням клавіші:
// розширення ШІ не повинно «натискати» їх як поле вводу.
export type ToetsTaal = 'uk' | 'nl';
export type ToetsLaag = 'letters' | 'cijfers' | 'tekens';

const UK = ['йцукенгшщзхї', 'фівапролджє', 'ячсмитьбюґ'];
const NL = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export function toetsRijen(taal: ToetsTaal, laag: ToetsLaag, shift: boolean): string[][] {
  if (laag === 'cijfers') return [['1234567890'], ['-/:;()€&@']];
  if (laag === 'tekens') return [['[]{}#%^*+='], ['_\\|~<>$\'"']];
  const bron = taal === 'nl' ? NL : UK;
  return bron.map((rij) => [...rij].map((t) => (shift ? t.toLocaleUpperCase(taal === 'nl' ? 'nl' : 'uk') : t)));
}
