// Єдиний спільний спостерігач перекривних шарів (модальні вікна, редактори, переглядачі) для всіх піддоменів «Макет».
// Групує виклики DOM-перевірок в один кадр requestAnimationFrame і викликає стан лише при реальній зміні значення.
// Gedeelde laagwaarnemer die DOM-controles per animatiekader bundelt via requestAnimationFrame.

export interface OpenLaagOpties {
  wortel?: 'body' | 'documentElement' | 'beide';
  subtree?: boolean;
  attributeFilter?: string[];
  htmlAttributeFilter?: string[];
  extraControle?: () => boolean;
  extraActie?: () => void;
  extraEvents?: ReadonlyArray<string>;
  opResize?: boolean;
}

export function abonneerOpenLaag(
  selector: string,
  onChange: (open: boolean) => void,
  opties: OpenLaagOpties = {},
): () => void {
  if (typeof document === 'undefined') {
    onChange(false);
    return () => {};
  }

  const bereken = (): boolean => {
    const hoofd = selector ? Boolean(document.querySelector(selector)) : false;
    if (hoofd) return true;
    return Boolean(opties.extraControle?.());
  };

  let vorige = bereken();
  onChange(vorige);
  opties.extraActie?.();

  let raf = 0;
  let actief = true;

  const verwerk = () => {
    raf = 0;
    if (!actief) return;
    const nu = bereken();
    if (nu !== vorige) {
      vorige = nu;
      onChange(nu);
    }
    opties.extraActie?.();
  };

  const plan = () => {
    if (!actief || raf) return;
    if (typeof requestAnimationFrame === 'function') {
      raf = requestAnimationFrame(verwerk);
    } else {
      verwerk();
    }
  };

  const waarnemer = typeof MutationObserver === 'function' ? new MutationObserver(plan) : null;
  const wortelKeuze = opties.wortel ?? 'body';
  const metSubtree = opties.subtree !== false;

  if (waarnemer) {
    const basisAttr = opties.attributeFilter;
    if (wortelKeuze === 'body') {
      if (document.body) {
        waarnemer.observe(document.body, {
          childList: true,
          subtree: metSubtree,
          ...(basisAttr ? { attributes: true, attributeFilter: basisAttr } : {}),
        });
      }
    } else if (wortelKeuze === 'documentElement') {
      const knoop = document.documentElement ?? document.body;
      if (knoop) {
        waarnemer.observe(knoop, {
          childList: true,
          subtree: metSubtree,
          ...(basisAttr ? { attributes: true, attributeFilter: basisAttr } : {}),
        });
      }
    } else {
      if (document.body) {
        waarnemer.observe(document.body, {
          childList: true,
          subtree: metSubtree,
          ...(basisAttr ? { attributes: true, attributeFilter: basisAttr } : {}),
        });
      }
      if (document.documentElement) {
        const htmlAttr = opties.htmlAttributeFilter ?? basisAttr;
        waarnemer.observe(document.documentElement, {
          attributes: true,
          ...(htmlAttr ? { attributeFilter: htmlAttr } : {}),
        });
      }
    }
  }

  const extraEvents = opties.extraEvents ?? [];
  if (typeof window !== 'undefined') {
    for (const ev of extraEvents) {
      window.addEventListener(ev, plan);
    }
    if (opties.opResize) {
      window.addEventListener('resize', plan);
    }
  }

  return () => {
    actief = false;
    if (raf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    waarnemer?.disconnect();
    if (typeof window !== 'undefined') {
      for (const ev of extraEvents) {
        window.removeEventListener(ev, plan);
      }
      if (opties.opResize) {
        window.removeEventListener('resize', plan);
      }
    }
  };
}

export function abonneerElementAttributen(
  element: Element,
  attributeFilter: string[],
  onMutatie: () => void,
  opties: { meteen?: boolean; zonderRaf?: boolean } = {},
): () => void {
  if (opties.meteen) onMutatie();
  let raf = 0;
  let actief = true;

  const plan = () => {
    if (!actief) return;
    if (opties.zonderRaf || typeof requestAnimationFrame !== 'function') {
      onMutatie();
      return;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (actief) onMutatie();
    });
  };

  const waarnemer = typeof MutationObserver === 'function' ? new MutationObserver(plan) : null;
  waarnemer?.observe(element, { attributes: true, attributeFilter });

  return () => {
    actief = false;
    if (raf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    waarnemer?.disconnect();
  };
}

