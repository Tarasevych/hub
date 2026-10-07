import { useEffect } from 'react';
import { registerSiteActions, type SiteAction } from './ai-site-actions';

/**
 * Een component meldt zijn acties aan bij de assistent-laag van de site (zichtbaar via de browserextensie als
 * `<context>_<id>`) en meldt ze af zodra hij verdwijnt. Geef `actions` een stabiele referentie (useMemo).
 *
 *   const actions = useMemo(() => [{ id: 'refresh', description: 'Reload the list', run: () => reload() }], [reload]);
 *   useMcpContext('mail', actions);
 *
 * Wat een actie mag wijzigen blijft onder de goedkeuring van de gebruiker (server: browser.invoke).
 */
export function useMcpContext(context: string, actions: SiteAction[]): void {
  useEffect(() => registerSiteActions(context, actions), [context, actions]);
}
