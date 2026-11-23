import { BUTTON_ANCHOR, matchIdFromUrl } from '@/utils/faceit';
import { type ImportButton, mountImportButton } from './button';
import './style.css';

/**
 * Adds the Import to Stratbase button to FACEIT match rooms. FACEIT is a single-page app, so
 * the button follows navigation and waits for FACEIT to render the room.
 */
export default defineContentScript({
  matches: ['https://www.faceit.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    let current: { matchId: string; ui: ShadowRootContentScriptUi<ImportButton> } | null = null;
    // Where the page is going. On Chromium WXT reports a navigation before location changes.
    let url = location.href;

    async function sync() {
      const matchId = matchIdFromUrl(url);

      if (current?.matchId === matchId) {
        return;
      }

      current?.ui.remove();
      current = null;

      if (!matchId) {
        return;
      }

      const ui = await createShadowRootUi<ImportButton>(ctx, {
        name: 'stratbase-import',
        position: 'inline',
        anchor: BUTTON_ANCHOR,
        append: 'after',
        onMount: (container) => mountImportButton(container, matchId),
        onRemove: (button) => button?.destroy(),
      });

      // The player may have moved on while the UI was made.
      if (matchIdFromUrl(url) !== matchId || current !== null) {
        ui.remove();

        return;
      }

      current = { matchId, ui };
      ui.autoMount();
    }

    ctx.addEventListener(window, 'wxt:locationchange', (event) => {
      url = event.newUrl.href;
      void sync();
    });
    await sync();
  },
});
