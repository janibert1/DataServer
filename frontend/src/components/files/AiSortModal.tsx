import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Sparkles, X } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (maxDepth: number, prompt: string) => void;
  isPending: boolean;
}

const DEPTH_OPTIONS = [
  { value: 1, label: '1', description: 'Root only' },
  { value: 2, label: '2', description: '2 levels' },
  { value: 3, label: '3', description: '3 levels' },
  { value: 4, label: '4', description: '4 levels' },
];

export function AiSortModal({ open, onClose, onConfirm, isPending }: Props) {
  const [maxDepth, setMaxDepth] = useState(2);
  const [prompt, setPrompt] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(maxDepth, prompt.trim());
  }

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <Dialog.Title className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  AI Sort Files
                </Dialog.Title>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Folder depth
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {DEPTH_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMaxDepth(opt.value)}
                        className={clsx(
                          'flex flex-col items-center py-2.5 rounded-xl border text-sm font-medium transition-colors',
                          maxDepth === opt.value
                            ? 'bg-violet-50 border-violet-300 text-violet-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        <span className="text-base font-bold">{opt.label}</span>
                        <span className="text-xs mt-0.5 font-normal opacity-75">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    How many folder levels deep the AI is allowed to reorganize. Lower values protect deeply nested files.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Instructions <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Put all invoices in Finance/, separate work and personal photos"
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none"
                  />
                </div>

                <div className="pt-1 text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                  Gemini AI will analyze your files and move them into folders. Only moves — no deletions.
                  You'll get a notification when done.
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isPending ? 'Starting…' : 'Sort files'}
                  </button>
                </div>
              </form>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
