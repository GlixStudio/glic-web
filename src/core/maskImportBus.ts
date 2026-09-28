// Opens the mask import dialog from anywhere (selection toolbar, Masks panel)
// without threading callbacks through the tree.

export interface MaskImportRequest {
    image: ImageData;
    name: string;
    /** true when re-placing an existing library mask (brightness is the mask) */
    fromLibrary?: boolean;
}

export const MASK_IMPORT_EVENT = 'glic:mask-import';

export const openMaskImport = (req: MaskImportRequest) =>
    window.dispatchEvent(new CustomEvent<MaskImportRequest>(MASK_IMPORT_EVENT, { detail: req }));
