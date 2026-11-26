// SITE-001 (пункт 15): закодований шлях («/%D1%89%D0%BE») показуємо так, як його бачить людина; зіпсоване кодування — як є.
// nl: een gecodeerd pad leesbaar tonen; een kapotte codering ongewijzigd.
export const leesbaarPad = (pad: string): string => { try { return decodeURI(pad); } catch { return pad; } };
