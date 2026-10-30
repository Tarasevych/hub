// Одна мініатюра zip за раз: хвіст читається чергою, не пачкою паралельних розборів.

let keten: Promise<unknown> = Promise.resolve();

export function naElkaar<T>(werk: () => Promise<T>): Promise<T> {
  const volgend = keten.then(werk, werk);
  keten = volgend.then(() => undefined, () => undefined);
  return volgend;
}
