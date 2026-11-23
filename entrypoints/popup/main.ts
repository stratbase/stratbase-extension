import { type Session, send } from '@/utils/messages';
import './style.css';

const app = document.querySelector<HTMLElement>('#app')!;

function button(label: string, onClick: () => void, secondary = false): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = secondary ? 'button secondary' : 'button';
  element.textContent = label;
  element.addEventListener('click', onClick, { once: true });

  return element;
}

function link(label: string, href: string): HTMLAnchorElement {
  return Object.assign(document.createElement('a'), { className: 'button', textContent: label, href, target: '_blank', rel: 'noopener' });
}

function paragraph(...parts: (string | Node)[]): HTMLParagraphElement {
  const element = document.createElement('p');
  element.append(...parts);

  return element;
}

function render(...children: Node[]) {
  const header = document.createElement('header');
  header.append(Object.assign(document.createElement('img'), { src: '/icon/48.png', alt: '' }), Object.assign(document.createElement('h1'), { textContent: 'Stratbase' }));
  app.replaceChildren(header, ...children);
}

async function refresh() {
  render(paragraph('Checking Stratbase…'));
  const session = await send<Session | null>({ type: 'session:get' });

  if (!session.ok) {
    return render(paragraph(session.error), button('Try again', refresh));
  }

  if (session.data === null) {
    return render(paragraph('Sign in to import your FACEIT matches from their match rooms.'), button('Sign in to Stratbase', signIn));
  }

  const name = Object.assign(document.createElement('strong'), { textContent: session.data.name });

  render(
    paragraph('Signed in as ', name, '.'),
    session.data.subscribed
      ? paragraph('Open a finished FACEIT match room and use Import to Stratbase under Watch demo.')
      : paragraph('Importing FACEIT matches needs a Stratbase subscription.'),
    ...(session.data.subscribed ? [] : [link('Subscribe', session.data.subscribeUrl)]),
    button('Sign out', signOut, true),
  );
}

async function signIn() {
  render(paragraph('Signing in…'));
  const response = await send({ type: 'session:sign-in' });

  return response.ok ? refresh() : render(paragraph(response.error), button('Try again', signIn));
}

async function signOut() {
  await send({ type: 'session:sign-out' });
  await refresh();
}

void refresh();
