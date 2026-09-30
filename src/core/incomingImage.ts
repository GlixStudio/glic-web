// Every way an image arrives - drop, file picker, paste - goes through here, so one
// place decides what happens: with nothing open it simply opens; with an image
// open, the user chooses between placing it as a layer and opening it fresh.

export interface IncomingImage {
    image: ImageData;
    name: string;
    /** what brought it in, for the dialog's wording */
    via: 'paste' | 'drop' | 'upload';
}

export const INCOMING_IMAGE_EVENT = 'glic:incoming-image';

export const openIncomingImage = (req: IncomingImage) =>
    window.dispatchEvent(new CustomEvent<IncomingImage>(INCOMING_IMAGE_EVENT, { detail: req }));

/** the first image file in a clipboard / drag payload, if any */
export const imageFileFrom = (items: DataTransferItemList | null | undefined): File | null => {
    if (!items) return null;
    for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
    }
    return null;
};
