// IDENTITEIT-015 (herstelcodes, лінія C2): хто має право підхопити «herstelcodes-maken» після повернення від Google.
// У центрі облікового запису на одній сторінці живуть ТРИ екземпляри AccessPlaneView (alleen = methods / security / recovery).
// Раніше дію підхоплював перший, що завантажився (зазвичай «Способи входу»): сервер створював новий набір (старий знищено),
// а коди потрапляли в стан екземпляра без секції кодів — людина їх ніколи не бачила. Тепер — лише той, хто показує секцію
// «Коди відновлення» завжди: без поділу (alleen не задано) або розділ «Відновлення доступу».
// Wie mag «herstelcodes-maken» na terugkeer van Google hervatten: alleen een exemplaar dat de herstelcodesectie altijd toont.
export type ToegangDeel = 'methods' | 'security' | 'recovery' | undefined;

export const magHerstelcodesHervatten = (alleen: ToegangDeel): boolean => !alleen || alleen === 'recovery';
