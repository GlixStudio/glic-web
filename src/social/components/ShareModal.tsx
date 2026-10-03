// Share to Gallery: what's on the canvas, prepared in the browser and uploaded
// with a project, so every post can be remixed - the whole layer stack, or (if
// its maker keeps that) the image itself with the codec settings.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/controls/Modal';
import { Toggle } from '../../components/controls/Toggle';
import { useApp } from '../../core/AppContext';
import { cloneConfig } from '../../core/Codec';
import { VISIBILITIES, type Visibility } from '../../../shared/api';
import { api } from '../api';
import { useSession } from '../session';
import { navigate, postPath } from '../router';
import { formatBytes, prepareImageData, type PreparedMedia } from '../mediaPrep';
import { packProject } from '../projectBundle';
import { autoTags, hasEncode, imageOnlyProject } from '../editorOutput';
import { Button, ErrorNote, Field, Spinner, inputClass } from './ui';

const MB = 1024 * 1024;

const VISIBILITY_LABEL: Record<Visibility, string> = {
    public: 'Public - in the gallery',
    unlisted: 'Unlisted - only people with the link',
    private: 'Private - only you',
};

export const ShareModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { layers, projectName, presetName, renderView, snapshotProject, config, separateChannels, toast } = useApp();
    const { settings, user } = useSession();
    const encoded = hasEncode(layers);
    const [withProject, setWithProject] = useState(true);
    const [title, setTitle] = useState(projectName !== 'Untitled' ? projectName : '');
    const [body, setBody] = useState('');
    // filled from how the piece was made; the user can edit them
    const [tags, setTags] = useState(() => autoTags(layers, presetName).join(' '));
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [prepared, setPrepared] = useState<PreparedMedia | null>(null);
    const [step, setStep] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    // the exact pixels being shared, reused for the image-only project
    const viewRef = useRef<ImageData | null>(null);

    const limits = useMemo(
        () => ({ targetBytes: (settings?.targetMediaMB ?? 8) * MB, maxBytes: (settings?.maxMediaMB ?? 10) * MB }),
        [settings?.targetMediaMB, settings?.maxMediaMB]
    );

    // prepare (and convert, if needed) when the dialog opens, so it can say
    // what will be uploaded before anything is
    useEffect(() => {
        if (!encoded) return;
        let live = true;
        const run = async () => {
            try {
                const view = renderView();
                viewRef.current = view;
                if (!view) return;
                const p = await prepareImageData(view, projectName !== 'Untitled' ? projectName : 'glix', limits, s => live && setStep(s));
                if (live) setPrepared(p);
            } catch (e) {
                if (live) setError((e as Error).message);
            } finally {
                if (live) setStep(null);
            }
        };
        void run();
        return () => {
            live = false;
        };
    }, [encoded, limits, renderView, projectName]);

    const previewUrl = useMemo(() => {
        const f = prepared?.preview ?? prepared?.primary;
        return f ? URL.createObjectURL(f.blob) : null;
    }, [prepared]);
    useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

    const parsedTags = [
        ...new Set(
            tags
                .split(/[\s,#]+/)
                .map(t => t.trim().toLowerCase())
                .filter(Boolean)
        ),
    ].slice(0, 12);

    const share = async () => {
        if (!prepared || !viewRef.current) return;
        setError(null);
        setProgress(0);
        try {
            setStep(withProject ? 'Packing the project' : 'Packing the image');
            const name = title.trim() || (projectName !== 'Untitled' ? projectName : 'GLIX piece');
            const rec = withProject
                ? await snapshotProject()
                : await imageOnlyProject(viewRef.current, name, cloneConfig(config), separateChannels);
            if (!rec) throw new Error('Nothing on the canvas to share');
            const bundle = await packProject({ ...rec, name });
            const max = (settings?.maxProjectMB ?? 25) * MB;
            if (bundle.size > max)
                throw new Error(`The project is ${formatBytes(bundle.size)}; projects can be up to ${formatBytes(max)}. Merge or delete layers, or share the image only.`);
            setStep('Uploading');
            const post = await api.createPost(
                {
                    title: title.trim(),
                    body: body.trim(),
                    tags: parsedTags,
                    visibility,
                    metadata: {
                        app: 'glix-encoder',
                        // 0 = the image as a project; more = the full stack to remix
                        layers: withProject ? rec.layers.length : 0,
                        preset: presetName,
                        codec: { ...config },
                    },
                    primary: prepared.primary,
                    preview: prepared.preview ?? undefined,
                    project: { blob: bundle, name: `${name.replace(/[^\w-]+/g, '_').slice(0, 60) || 'glix'}.glixproj.zip` },
                },
                f => setProgress(f)
            );
            toast('success', post.status === 'pending' ? 'Shared - waiting for a moderator to approve it' : 'Shared to the gallery');
            onClose();
            navigate(postPath(post.id));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStep(null);
            setProgress(null);
        }
    };

    const uploading = progress !== null;
    const mode = settings?.postModeration ?? 'open';
    const reviewed = user && user.role !== 'admin' && user.role !== 'moderator' && (mode === 'review' || (mode === 'trusted' && user.role === 'user'));

    return (
        <Modal
            title="Share to Gallery"
            onClose={uploading ? () => {} : onClose}
            width="max-w-lg"
            footer={
                <>
                    <Button onClick={onClose} disabled={uploading}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={share} disabled={!prepared || uploading || !!step}>
                        {uploading ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : 'Share'}
                    </Button>
                </>
            }
        >
            {!encoded ? (
                <div className="space-y-3 text-[13px]">
                    <p>The gallery is for what the GLIX codec makes: encode at least once (press E), then share.</p>
                    <Button
                        variant="primary"
                        onClick={() => {
                            onClose();
                            navigate('/');
                        }}
                    >
                        Open the editor
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex gap-3 items-center rounded-lg border border-line bg-cream-2 p-2">
                        <div className="w-20 h-20 flex-shrink-0 rounded-md bg-stage overflow-hidden flex items-center justify-center">
                            {previewUrl ? <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain" /> : <Spinner className="w-5 h-5 text-cream" />}
                        </div>
                        <div className="min-w-0 text-[12px]">
                            {step && (
                                <div className="flex items-center gap-1.5 text-ink-2">
                                    <Spinner className="w-3 h-3" /> {step}…
                                </div>
                            )}
                            {prepared && !step && (
                                <>
                                    <div className="flex items-center gap-1.5 font-bold">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-700" /> Ready
                                    </div>
                                    <div className="text-ink-2">{prepared.summary}</div>
                                    {prepared.warning && <div className="mt-0.5 text-[11px] text-red-800">{prepared.warning}</div>}
                                    <div className="text-ink-2 font-mono text-[11px]">
                                        {prepared.primary.width}×{prepared.primary.height}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    {uploading && (
                        <div className="h-1.5 rounded-full bg-cream-3 overflow-hidden border border-line">
                            <div className="h-full bg-glx-green transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
                        </div>
                    )}

                    <div>
                        <Toggle label="Include editable project" checked={withProject} onChange={setWithProject} />
                        <p className="text-[11px] text-ink-2 mt-1">
                            {withProject
                                ? `Remixers get the whole project: ${layers.length} ${layers.length === 1 ? 'layer' : 'layers'}, masks, effects and codec settings.`
                                : 'Remixers get the image with your codec settings, ready to encode on top - your layers stay with you.'}
                        </p>
                    </div>

                    <Field label="Title">
                        <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Untitled" />
                    </Field>
                    <Field label="Description">
                        <textarea className={`${inputClass} min-h-[64px]`} value={body} onChange={e => setBody(e.target.value)} maxLength={5000} />
                    </Field>
                    <Field label="Tags" hint={parsedTags.length ? parsedTags.map(t => `#${t}`).join(' ') : 'Separate with spaces or commas'}>
                        <input className={inputClass} value={tags} onChange={e => setTags(e.target.value)} placeholder="wavelet databend hwb" />
                    </Field>
                    <Field label="Visibility">
                        <select className={inputClass} value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}>
                            {VISIBILITIES.map(v => (
                                <option key={v} value={v}>
                                    {VISIBILITY_LABEL[v]}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {reviewed && <p className="text-[11px] text-ink-2">New posts are reviewed by a moderator before they appear in the gallery.</p>}
                    <ErrorNote error={error} />
                </div>
            )}
        </Modal>
    );
};
