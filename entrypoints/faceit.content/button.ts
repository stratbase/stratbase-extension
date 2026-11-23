// Inlined: a content script's asset URL would resolve against faceit.com.
import markUrl from '@/assets/mark.png?inline';
import { requestDownloadLink } from '@/utils/faceit';
import { type MatchState, type Response, type Session, send } from '@/utils/messages';

/**
 * The Import to Stratbase button on a FACEIT match room. Plain DOM: it's one button with a
 * line of text under it.
 */

type View =
  | { kind: 'busy'; label: string; note?: string }
  | { kind: 'action'; label: string; note?: string; error?: boolean; onClick: () => void }
  | { kind: 'link'; label: string; href: string; note?: string; error?: boolean };

/** How often to check on an import while Stratbase works on it, and on a demo FACEIT hasn't published. */
const POLL_MS = { downloading: 5_000, processing: 15_000, notReady: 30_000 };

export interface ImportButton {
  destroy(): void;
}

export function mountImportButton(container: HTMLElement, matchId: string): ImportButton {
  const root = document.createElement('div');
  root.className = 'stratbase';
  container.append(root);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  function render(view: View) {
    if (destroyed) {
      return;
    }

    const button = document.createElement(view.kind === 'link' ? 'a' : 'button');
    button.className = 'button';

    if (view.kind === 'link') {
      Object.assign(button, { href: view.href, target: '_blank', rel: 'noopener' });
    } else {
      button.setAttribute('type', 'button');
    }

    if (view.kind === 'busy') {
      button.setAttribute('aria-disabled', 'true');
      button.append(Object.assign(document.createElement('span'), { className: 'spinner' }));
    } else {
      button.append(Object.assign(document.createElement('img'), { className: 'mark', src: markUrl, alt: '' }));
    }

    if (view.kind === 'action') {
      button.addEventListener('click', view.onClick, { once: true });
    }

    button.append(view.label);
    const children: Node[] = [button];

    if (view.note) {
      const note = document.createElement('p');
      note.className = view.kind !== 'busy' && view.error ? 'note error' : 'note';
      note.setAttribute('role', 'status');
      note.textContent = view.note;
      children.push(note);
    }

    root.replaceChildren(...children);
  }

  function later(ms: number, then: () => void) {
    if (destroyed) {
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(then, ms);
  }

  /** Shows a failed request, offering what fixes it. */
  function showError(response: Extract<Response<unknown>, { ok: false }>, retry: () => void) {
    if (response.signedOut) {
      return render({ kind: 'action', label: 'Sign in to Stratbase', onClick: signIn });
    }

    if (response.notSubscribed && response.subscribeUrl) {
      return render({ kind: 'link', label: 'Subscribe to import', href: response.subscribeUrl, note: response.error });
    }

    render({ kind: 'action', label: 'Try again', note: response.error, error: true, onClick: retry });
  }

  async function signIn() {
    render({ kind: 'busy', label: 'Signing in…' });
    const response = await send({ type: 'session:sign-in' });

    return response.ok ? refresh() : showError(response, signIn);
  }

  async function refresh() {
    clearTimeout(timer);
    const session = await send<Session | null>({ type: 'session:get' });

    if (!session.ok) {
      return showError(session, refresh);
    }

    if (session.data === null) {
      return render({ kind: 'action', label: 'Sign in to Stratbase', onClick: signIn });
    }

    if (!session.data.subscribed) {
      return render({ kind: 'link', label: 'Subscribe to import', href: session.data.subscribeUrl, note: 'Importing FACEIT matches needs a Stratbase subscription.' });
    }

    await checkMatch();
  }

  /** The session is only checked once: a later 401 or 402 comes back on the match itself. */
  async function checkMatch() {
    const match = await send<MatchState>({ type: 'match:get', matchId });

    return match.ok ? show(match.data) : showError(match, refresh);
  }

  function show(state: MatchState) {
    switch (state.status) {
      case 'new':
        return render({ kind: 'action', label: 'Import to Stratbase', onClick: importWithLink });
      case 'available':
        return render({ kind: 'action', label: 'Add to Stratbase', note: 'A teammate already imported this match.', onClick: () => importMatch(null) });
      case 'downloading':
        later(POLL_MS.downloading, checkMatch);

        return render({ kind: 'busy', label: 'Downloading to Stratbase…' });
      case 'processing':
        later(POLL_MS.processing, checkMatch);

        return render({ kind: 'busy', label: 'Analysing on Stratbase…', note: 'This usually takes a few minutes. You can leave this page.' });
      case 'ready':
        return render({ kind: 'link', label: 'Open in Stratbase', href: state.url! });
      case 'failed':
        // Downloading again only helps when the download failed: the same file analyses the same way.
        return state.retryable
          ? render({ kind: 'action', label: 'Try again', note: state.failure ?? undefined, error: true, onClick: importWithLink })
          : render({ kind: 'link', label: 'Open in Stratbase', note: state.failure ?? undefined, error: true, href: state.url! });
    }
  }

  async function importWithLink(): Promise<void> {
    render({ kind: 'busy', label: 'Getting the demo from FACEIT…' });
    const link = await requestDownloadLink(matchId);

    if (destroyed) {
      return;
    }

    if (link.status === 'not-ready') {
      later(POLL_MS.notReady, importWithLink);

      return render({ kind: 'busy', label: 'Waiting for FACEIT’s demo…', note: 'FACEIT hasn’t published the demo yet. Stay on this page and it will import when it’s ready.' });
    }

    if (link.status === 'error') {
      return render({ kind: 'action', label: 'Try again', note: link.error, error: true, onClick: importWithLink });
    }

    await importMatch(link.url);
  }

  async function importMatch(downloadUrl: string | null): Promise<void> {
    render({ kind: 'busy', label: 'Sending to Stratbase…' });
    const response = await send<MatchState>({ type: 'match:import', matchId, downloadUrl });

    // A retry later on needs a fresh link: FACEIT's last only minutes.
    return response.ok ? show(response.data) : showError(response, downloadUrl ? importWithLink : () => importMatch(null));
  }

  render({ kind: 'busy', label: 'Checking Stratbase…' });
  void refresh();

  return {
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      root.remove();
    },
  };
}
