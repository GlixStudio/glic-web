// View commands from the menu bar to the canvas viewer (which owns zoom state).
export type ViewCommand = 'zoom-in' | 'zoom-out' | 'fit' | 'actual' | 'toggle-segmentation';

export const VIEW_EVENT = 'glic:view';

export const sendView = (cmd: ViewCommand) =>
    window.dispatchEvent(new CustomEvent<ViewCommand>(VIEW_EVENT, { detail: cmd }));
