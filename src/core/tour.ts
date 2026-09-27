// Tour trigger shared between the Tour overlay and the Help modal.
export const START_TOUR_EVENT = 'glic:start-tour';
export const startTour = () => window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));
