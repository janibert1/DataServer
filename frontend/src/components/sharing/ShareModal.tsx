import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Share2, UserPlus, Copy, Check, Globe, Lock, ChevronDown } from 'lucide-react';
import { useFolderShareInfo, useShareFolder, useRevokeShare, useUpdateSharePermission, useToggleShareable, useCreateFolderShareInvitation } from '../../hooks/useFolders';
import { SharePermission } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
  folderId: string;
}

const PERMISSIONS: { value: SharePermission; label: string; description: string }[] = [
  { value: 'VIEWER', label: 'Viewer', description: 'Can view and preview files' },
  { value: 'DOWNLOADER', label: 'Downloader', description: 'Can view and download files' },
  { value: 'CONTRIBUTOR', label: 'Contributor', description: 'Can view and upload files' },
  { value: 'EDITOR', label: 'Editor', description: 'Can view, upload, edit, and delete' },
];

function PermissionSelect({ value, onChange }: { value: SharePermission; onChange: (v: SharePermission) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SharePermission)}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
      >
        {PERMISSIONS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

export function ShareModal({ open, onClose, folderId }: Props) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('VIEWER');
  const [canReshare, setCanReshare] = useState(false);
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch } = useFolderShareInfo(folderId);
  const shareFolder = useShareFolder();
  const revokeShare = useRevokeShare();
  const updatePermission = useUpdateSharePermission();
  const toggleShareable = useToggleShareable();
  const createInvite = useCreateFolderShareInvitation();

  const folder = data?.folder;
  const shares = (data?.shares ?? []).filter((s: any) => !s.revokedAt);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await shareFolder.mutateAsync({ folderId, email: email.trim(), permission, canReshare });
    setEmail('');
    refetch();
  };

  const handleGenerateInvite = async () => {
    const result = await createInvite.mutateAsync({
      folderId,
      targetPermission: permission,
      expiresAt: inviteExpiry || undefined,
    });
    setGeneratedCode(result.data.invitation.code);
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Code copied to clipboard');
    }
  };

  const handleToggleShareable = async () => {
    if (!folder) return;
    await toggleShareable.mutateAsync({ id: folderId, isShared: !folder.isShared });
    refetch();
  };

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <Dialog.Title className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-brand-600" />
                  Share "{folder?.name}"
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {isLoading ? (
                  <div className="flex justify-center py-8"><LoadingSpinner /></div>
                ) : (
                  <>
                    {/* Shareable toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        {folder?.isShared
                          ? <Globe className="w-5 h-5 text-brand-600" />
                          : <Lock className="w-5 h-5 text-slate-400" />
                        }
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {folder?.isShared ? 'Sharing enabled' : 'Sharing disabled'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {folder?.isShared
                              ? 'Others can be invited to this folder'
                              : 'Enable sharing to invite others'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleToggleShareable}
                        disabled={toggleShareable.isPending}
                        className={clsx(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          folder?.isShared ? 'bg-brand-600' : 'bg-slate-300'
                        )}
                      >
                        <span className={clsx(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          folder?.isShared ? 'translate-x-6' : 'translate-x-1'
                        )} />
                      </button>
                    </div>

                    {folder?.isShared && (
                      <>
                        {/* Add person */}
                        <div>
                          <h3 className="text-sm font-medium text-slate-700 mb-3">Share with person</h3>
                          <form onSubmit={handleShare} className="flex gap-2">
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="Email address"
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                            />
                            <PermissionSelect value={permission} onChange={setPermission} />
                            <button
                              type="submit"
                              disabled={!email.trim() || shareFolder.isPending}
                              className="px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              <UserPlus className="w-4 h-4" />
                              Share
                            </button>
                          </form>
                          <label className="flex items-center gap-2 mt-2 text-xs text-slate-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={canReshare}
                              onChange={(e) => setCanReshare(e.target.checked)}
                              className="rounded border-slate-300 text-brand-600"
                            />
                            Allow this person to re-share
                          </label>
                        </div>

                        {/* Current shares */}
                        {shares.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium text-slate-700 mb-3">People with access</h3>
                            <div className="space-y-2">
                              {shares.map((share: any) => (
                                <div key={share.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                                    {share.recipient?.displayName?.[0]?.toUpperCase() ?? '?'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">
                                      {share.recipient?.displayName ?? share.recipientEmail ?? 'Pending'}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate">
                                      {share.recipient?.email ?? 'Invitation pending'}
                                    </p>
                                  </div>
                                  <select
                                    value={share.permission}
                                    onChange={(e) => updatePermission.mutate({
                                      folderId,
                                      shareId: share.id,
                                      permission: e.target.value as SharePermission,
                                    })}
                                    className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none"
                                  >
                                    {PERMISSIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                  </select>
                                  <button
                                    onClick={() => revokeShare.mutate({ folderId, shareId: share.id })}
                                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                  >
                                    Revoke
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Generate invite code */}
                        <div className="border-t border-slate-100 pt-4">
                          <h3 className="text-sm font-medium text-slate-700 mb-3">Generate invite code</h3>
                          <div className="flex gap-2 mb-3">
                            <input
                              type="date"
                              value={inviteExpiry}
                              onChange={(e) => setInviteExpiry(e.target.value)}
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
                              placeholder="Expiry date (optional)"
                              min={new Date().toISOString().split('T')[0]}
                            />
                            <button
                              onClick={handleGenerateInvite}
                              disabled={createInvite.isPending}
                              className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 disabled:opacity-50 transition-colors"
                            >
                              Generate
                            </button>
                          </div>

                          {generatedCode && (
                            <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200 rounded-lg">
                              <code className="flex-1 text-base font-mono font-bold text-brand-800 tracking-widest">
                                {generatedCode}
                              </code>
                              <button
                                onClick={handleCopyCode}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700 transition-colors"
                              >
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
