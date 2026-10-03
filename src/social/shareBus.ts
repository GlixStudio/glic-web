// Anything can ask for the Share to Gallery dialog (header button, File menu,
// gallery header) without holding its state - the community layer listens.

export const SHARE_EVENT = 'glix:share';

export const openShare = () => window.dispatchEvent(new Event(SHARE_EVENT));
