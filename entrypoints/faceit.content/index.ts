import { BUTTON_ANCHORS, matchIdFromUrl, type Placement, placementFromUrl } from '@/utils/faceit';
import { type ImportButton, mountImportButton } from './button';
import './style.css';

/**
 * Adds the Import to Stratbase button to FACEIT match rooms: under the demo buttons on the
 * overview, and as a banner on the stats tab, which has none. FACEIT is a single-page app, so
 * the button follows navigation and waits for FACEIT to render the room.
 */
export default defineContentScript({
  matches: ['https://www.faceit.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    let current: { key: string; ui: ShadowRootContentScriptUi<ImportButton> } | null = null;
    // Where the page is going. On Chromium WXT reports a navigation before location changes.
    let url = location.href;

    /** The match and the tab it's shown on, or null outside a match room. */
    function where(): { key: string; matchId: string; placement: Placement } | null {
      const matchId = matchIdFromUrl(url);
      const placement = placementFromUrl(url);

      return matchId ? { key: `${matchId}:${placement}`, matchId, placement } : null;
    }

    async function sync() {
      const target = where();

      if (current?.key === target?.key) {
        return;
      }

      current?.ui.remove();
      current = null;

      if (!target) {
        return;
      }

      const { key, matchId, placement } = target;
      const ui = await createShadowRootUi<ImportButton>(ctx, {
        name: 'stratbase-import',
        position: 'inline',
        anchor: BUTTON_ANCHORS[placement],
        append: 'after',
        onMount: (container) => mountImportButton(container, matchId, placement),
        onRemove: (button) => button?.destroy(),
      });

      // The player may have moved on while the UI was made.
      if (where()?.key !== key || current !== null) {
        ui.remove();

        return;
      }

      current = { key, ui };
      ui.autoMount();
    }

    ctx.addEventListener(window, 'wxt:locationchange', (event) => {
      url = event.newUrl.href;
      void sync();
    });
    await sync();
  },
});
