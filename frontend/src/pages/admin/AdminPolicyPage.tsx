import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Save, X, Plus, Info } from 'lucide-react';
import { api, getErrorMessage } from '../../lib/axios';
import { StoragePolicy } from '../../types';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function usePolicy() {
  return useQuery({
    queryKey: ['admin', 'policy'],
    queryFn: async () => {
      const res = await api.get('/admin/policy');
      return res.data.policy as StoragePolicy;
    },
  });
}

function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StoragePolicy>) => api.patch('/admin/policy', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'policy'] });
      toast.success('Policy updated.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function bytesToGB(bytes: string): string {
  return (parseInt(bytes) / 1024 ** 3).toFixed(2);
}

function gbToBytes(gb: string): string {
  return Math.round(parseFloat(gb) * 1024 ** 3).toString();
}

// ── Tag Input ─────────────────────────────────────────────────────────────────
function TagInput({
  label,
  description,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const tags = raw.split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter((t) => t && !values.includes(t));
    if (tags.length > 0) onChange([...values, ...tags]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {description && <p className="text-xs text-slate-400 mb-2">{description}</p>}
      <div className="min-h-10 w-full px-3 py-2 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-brand-300 focus-within:border-brand-400 bg-white flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-medium rounded-full">
            {tag}
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== tag))}
              className="hover:text-brand-900 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={values.length === 0 ? (placeholder ?? 'Type and press Enter…') : ''}
          className="flex-1 min-w-20 text-sm outline-none bg-transparent"
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">Press Enter or comma to add. Backspace to remove last.</p>
    </div>
  );
}

// ── Form section wrapper ──────────────────────────────────────────────────────
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">{title}</h3>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

// ── Number input ──────────────────────────────────────────────────────────────
function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {description && <p className="text-xs text-slate-400 mb-2">{description}</p>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step ?? 1}
          className="w-36 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
        />
        {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function AdminPolicyPage() {
  const { data: policy, isLoading } = usePolicy();
  const updatePolicy = useUpdatePolicy();

  const [defaultQuotaGB, setDefaultQuotaGB] = useState('');
  const [maxFileSizeGB, setMaxFileSizeGB] = useState('');
  const [blockedExtensions, setBlockedExtensions] = useState<string[]>([]);
  const [trashRetentionDays, setTrashRetentionDays] = useState('');
  const [versionRetentionCount, setVersionRetentionCount] = useState('');

  useEffect(() => {
    if (policy) {
      setDefaultQuotaGB(bytesToGB(policy.defaultQuotaBytes));
      setMaxFileSizeGB(bytesToGB(policy.maxFileSizeBytes));
      setBlockedExtensions(policy.blockedExtensions ?? []);
      setTrashRetentionDays(policy.trashRetentionDays?.toString() ?? '30');
      setVersionRetentionCount(policy.versionRetentionCount?.toString() ?? '5');
    }
  }, [policy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!defaultQuotaGB || !maxFileSizeGB) {
      toast.error('Please fill in all required fields.');
      return;
    }
    updatePolicy.mutate({
      defaultQuotaBytes: gbToBytes(defaultQuotaGB),
      maxFileSizeBytes: gbToBytes(maxFileSizeGB),
      blockedExtensions,
      trashRetentionDays: parseInt(trashRetentionDays),
      versionRetentionCount: parseInt(versionRetentionCount),
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Platform Policy</h1>
        <p className="text-sm text-slate-500 mt-1">Configure platform-wide storage and file management policies</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-brand-600" />
              <h2 className="text-base font-semibold text-slate-900">Policy Settings</h2>
            </div>

            <div className="p-6 space-y-8 max-w-xl">
              {/* Storage limits */}
              <FormSection title="Storage Limits">
                <NumberField
                  label="Default quota per user"
                  description="Storage quota automatically assigned to new users"
                  value={defaultQuotaGB}
                  onChange={setDefaultQuotaGB}
                  min={0.1}
                  step={0.5}
                  suffix="GB"
                />
                <NumberField
                  label="Maximum file size"
                  description="Single file upload size limit"
                  value={maxFileSizeGB}
                  onChange={setMaxFileSizeGB}
                  min={0.001}
                  step={0.1}
                  suffix="GB"
                />
              </FormSection>

              {/* File restrictions */}
              <FormSection title="File Restrictions">
                <TagInput
                  label="Blocked file extensions"
                  description="Files with these extensions cannot be uploaded"
                  values={blockedExtensions}
                  onChange={setBlockedExtensions}
                  placeholder="e.g. exe, bat, sh…"
                />
              </FormSection>

              {/* Retention */}
              <FormSection title="Retention Policy">
                <NumberField
                  label="Trash retention period"
                  description="Days before trashed files are permanently deleted"
                  value={trashRetentionDays}
                  onChange={setTrashRetentionDays}
                  min={1}
                  max={365}
                  suffix="days"
                />
                <NumberField
                  label="File version retention"
                  description="Maximum number of versions to keep per file"
                  value={versionRetentionCount}
                  onChange={setVersionRetentionCount}
                  min={1}
                  max={50}
                  suffix="versions"
                />
              </FormSection>

              {/* Info banner */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Policy changes apply immediately</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Existing users retain their current quota. New users will receive the updated default quota.
                    Existing files above the new size limit will not be affected.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (policy) {
                    setDefaultQuotaGB(bytesToGB(policy.defaultQuotaBytes));
                    setMaxFileSizeGB(bytesToGB(policy.maxFileSizeBytes));
                    setBlockedExtensions(policy.blockedExtensions ?? []);
                    setTrashRetentionDays(policy.trashRetentionDays?.toString() ?? '30');
                    setVersionRetentionCount(policy.versionRetentionCount?.toString() ?? '5');
                  }
                }}
                disabled={updatePolicy.isPending}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={updatePolicy.isPending}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                {updatePolicy.isPending ? 'Saving…' : 'Save policy'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
