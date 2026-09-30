// Screen-size classes shared by layout defaults. They only pick initial states
// (drawer open, dock collapsed, first-run notices); layout itself is CSS.

/** below Tailwind's md: the sidebar is an overlay drawer, the dock a pill */
export const isPhoneWidth = () => typeof window !== 'undefined' && window.innerWidth < 768;

/** below lg: tablets in portrait - the dock starts collapsed so it does not cover the image */
export const isNarrowWidth = () => typeof window !== 'undefined' && window.innerWidth < 1024;
