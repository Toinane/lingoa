import type { PRProposal } from "../../types";
import { useAuthStore } from "../../stores/authStore";
import { openExternal } from "../../lib/tauri";
import { useT } from "../../i18n";

interface Props {
  proposals: PRProposal[];
}

export default function ProposalsSection({ proposals }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const t = useT();

  if (proposals.length === 0) return null;

  const others = proposals.filter((p) => p.author !== currentUser);
  const own = proposals.filter((p) => p.author === currentUser);

  const renderProposal = (p: PRProposal, isOwn: boolean) => (
    <div
      key={`${p.prNumber}-${p.author}`}
      className="flex items-start gap-3 py-2.5 border-b border-app-border last:border-0"
    >
      <div
        className="w-6 h-6 rounded-full shrink-0 bg-app-surface-2 flex items-center justify-center text-xs text-app-muted overflow-hidden"
        title={p.author}
      >
        {p.authorAvatarUrl ? (
          <img src={p.authorAvatarUrl} alt={p.author} className="w-full h-full object-cover" />
        ) : (
          p.author[0]?.toUpperCase()
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-app-text text-xs font-medium">@{p.author}</span>
          {isOwn && (
            <span className="text-xs text-key-yellow bg-key-yellow/10 px-1.5 py-0.5 rounded">
              {t.editor.yours}
            </span>
          )}
          <button
            onClick={() => openExternal(p.prUrl)}
            className="text-app-muted text-xs hover:text-app-accent transition-colors"
          >
            PR #{p.prNumber}
          </button>
        </div>
        <p className="text-app-text text-sm bg-app-surface-2 rounded px-2 py-1.5 whitespace-pre-wrap">
          {p.value}
        </p>
      </div>
    </div>
  );

  return (
    <div className="px-6 pt-2 pb-4">
      <p className="text-xs uppercase tracking-wider text-app-muted mb-3">{t.editor.proposals}</p>
      <div className="bg-app-surface border border-app-border rounded-md overflow-hidden">
        {own.map((p) => renderProposal(p, true))}
        {others.map((p) => renderProposal(p, false))}
      </div>
    </div>
  );
}
