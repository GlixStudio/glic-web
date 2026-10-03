// /u/<handle>: who they are and what they made. Your own profile also shows
// your posts that are still in review or were taken down.

import React, { useEffect, useState } from 'react';
import type { Profile } from '../../../shared/api';
import { api } from '../api';
import { useSession } from '../session';
import { navigate, profilePath } from '../router';
import { GalleryHeader } from './GalleryView';
import { PostGrid } from './PostGrid';
import { PostView } from './PostView';
import { ReportButton } from './ReportButton';
import { Avatar, RoleBadge, Spinner } from './ui';

export const ProfileView: React.FC<{ handle: string; postId: string | null; onShare: () => void }> = ({ handle, postId, onShare }) => {
    const { user } = useSession();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let live = true;
        api.profile(handle)
            .then(p => live && (setProfile(p), setError(null)))
            .catch(e => live && setError((e as Error).message));
        return () => {
            live = false;
        };
    }, [handle]);

    const own = !!user && !!profile && user.id === profile.id;

    return (
        <div className="min-h-full bg-cream text-ink">
            <GalleryHeader onShare={user ? onShare : undefined} />
            <div className="max-w-[1800px] mx-auto px-3 sm:px-5">
                {error && <div className="py-24 text-center text-[14px] text-ink-2">{error}</div>}
                {!profile && !error && (
                    <div className="py-24 flex justify-center text-ink-2">
                        <Spinner className="w-5 h-5" />
                    </div>
                )}
                {profile && (
                    <>
                        <section className="py-8 flex flex-col items-center text-center gap-2">
                            <Avatar user={profile} size={72} />
                            <h1 className="text-[22px] font-black leading-tight flex items-center gap-2">
                                {profile.displayName || profile.handle} <RoleBadge role={profile.role} />
                            </h1>
                            <div className="text-[12px] text-ink-2">
                                @{profile.handle} · {profile.postCount} {profile.postCount === 1 ? 'post' : 'posts'} · joined{' '}
                                {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </div>
                            {profile.bio && <p className="max-w-md text-[13px] whitespace-pre-wrap">{profile.bio}</p>}
                            {user && !own && (
                                <ReportButton targetType="user" targetId={profile.id} className="text-[11px] text-ink-2 hover:text-ink underline">
                                    Report
                                </ReportButton>
                            )}
                        </section>
                        <div className="pb-16">
                            <PostGrid
                                query={own ? { mine: true, sort: 'new' } : { author: profile.handle, sort: 'new' }}
                                reloadKey={reloadKey}
                                onOpen={p => navigate(`${profilePath(profile.handle)}/${encodeURIComponent(p.id)}`)}
                                empty={<div className="py-16 text-center text-[13px] text-ink-2">{own ? 'You have not shared anything yet.' : 'No posts yet.'}</div>}
                            />
                        </div>
                    </>
                )}
            </div>
            {postId && <PostView postId={postId} onClose={() => navigate(profilePath(handle))} onDeleted={() => setReloadKey(k => k + 1)} />}
        </div>
    );
};
