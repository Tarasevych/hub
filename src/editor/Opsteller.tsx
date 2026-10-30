import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import './opsteller.css';

/** Можливості однієї оболонки. Усі true — це виправлений шлях, не другий редактор. */
export type OpstellerMogelijkheden = {
  link?: boolean;
  image?: boolean;
  background?: boolean;
  shortcuts?: boolean;
};

type Props = OpstellerMogelijkheden & {
  lang?: 'uk' | 'nl';
  children: ReactNode;
};

/**
 * Оболонка над ProseMirror. Атрибути лягають на наявний корінь
 * (без зайвого div — інакше `.mail-nm-editor > .mail-compose-editor` ламається).
 */
export default function Opsteller({ lang = 'uk', link = true, image = true, background = true, shortcuts = true, children }: Props) {
  const extra = {
    'data-opsteller': '1',
    'data-opsteller-taal': lang,
    'data-opsteller-link': link ? '1' : '0',
    'data-opsteller-image': image ? '1' : '0',
    'data-opsteller-background': background ? '1' : '0',
    'data-opsteller-shortcuts': shortcuts ? '1' : '0',
  };
  if (isValidElement(children)) return cloneElement(children as ReactElement<Record<string, string>>, extra);
  return <>{children}</>;
}
