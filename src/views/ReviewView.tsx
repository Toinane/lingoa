import { useState, useCallback } from "react";
import { usePRStore } from "../stores/prStore";
import { openExternal } from "../lib/tauri";
import { useRepoStore } from "../stores/repoStore";
import { useAuthStore } from "../stores/authStore";
import { fetchPRReviewData, submitReview } from "../lib/github";
import { useT, interp } from "../i18n";
import { isForkedRepo } from "../types";
import type { TranslationPR } from "../types";

interface KeyRow {
  key: string;
  source: string;
  translated: string;
}

export default function ReviewView() {
  const { openPRs, isLoading, reviewedPRs, markReviewed } = usePRStore();
  const { repoInfo } = useRepoStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const t = useT();

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem("lingoa-review-sidebar-width");
    return stored ? parseInt(stored, 10) : 288;
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let w = sidebarWidth;
      const onMove = (ev: MouseEvent) => {
        w = Math.min(Math.max(ev.clientX, 180), 520);
        setSidebarWidth(w);
      };
      const onUp = () => {
        localStorage.setItem("lingoa-review-sidebar-width", String(w));
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [sidebarWidth]
  );

  const [selectedPR, setSelectedPR] = useState<TranslationPR | null>(null);
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [reviewEvent, setReviewEvent] = useState<
    "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
  >("COMMENT");
  const [reviewBody, setReviewBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitted = selectedPR ? reviewedPRs.has(selectedPR.number) : false;

  const owner = repoInfo
    ? isForkedRepo(repoInfo) ? repoInfo.upstreamOwner : repoInfo.owner
    : undefined;
  const repo = repoInfo
    ? isForkedRepo(repoInfo) ? repoInfo.upstreamRepo : repoInfo.repo
    : undefined;

  const selectPR = async (pr: TranslationPR) => {
    if (!owner || !repo) return;
    setSelectedPR(pr);
    setIsLoadingDetail(true);
    setRows([]);
    setReviewBody("");
    setError(null);

    try {
      // Rust fetches + parses all PR files in one call
      const prFiles = await fetchPRReviewData(
        owner,
        repo,
        pr.number,
        pr.headSha,
        pr.baseBranch
      );
      setRows(prFiles.flatMap((f) => f.rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load PR details");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!owner || !repo || !selectedPR) return;
    if (reviewEvent === "REQUEST_CHANGES" && !reviewBody.trim()) {
      setError(t.review.requiresComment);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await submitReview(owner, repo, selectedPR.number, reviewEvent, reviewBody);
      markReviewed(selectedPR.number);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* PR list sidebar */}
      <aside className="bg-app-surface flex flex-col shrink-0" style={{ width: sidebarWidth }}>
        <div className="px-3 py-3 border-b border-app-border shrink-0">
          <h3 className="text-app-text font-medium text-sm">{t.review.sidebarTitle}</h3>
          <p className="text-app-muted text-xs mt-0.5">
            {interp(t.review.openCount, { n: openPRs.length })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-app-muted text-xs animate-pulse">
              {t.review.loadingPRs}
            </div>
          ) : openPRs.length === 0 ? (
            <div className="px-3 py-6 text-center text-app-muted text-xs">
              {t.review.noPRs}
            </div>
          ) : (
            openPRs.map((pr) => (
              <button
                key={pr.number}
                onClick={() => selectPR(pr)}
                className={`w-full px-3 py-3 text-left border-b border-app-border transition-colors ${
                  selectedPR?.number === pr.number
                    ? "bg-app-accent/10 border-l-2 border-l-app-accent"
                    : "hover:bg-app-surface-2"
                }`}
              >
                <div className="flex items-start gap-2">
                  {pr.isDraft && (
                    <span className="text-xs text-app-muted bg-app-surface-2 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                      {t.review.draft}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-mono text-key-blue bg-key-blue/10 px-1.5 py-0.5 rounded">
                        {pr.locale}
                      </span>
                      <span className="text-app-muted text-xs">#{pr.number}</span>
                    </div>
                    <div className="text-app-text text-xs font-medium truncate">
                      {pr.title}
                    </div>
                    <div className="text-app-muted text-xs mt-0.5">
                      @{pr.author}
                      {pr.author === currentUser && (
                        <span className="ml-1 text-key-yellow">{t.review.you}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Resize handle — 8px hit area, 1px visual */}
      <div
        onMouseDown={handleResizeStart}
        className="w-2 shrink-0 cursor-col-resize group relative"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-app-border group-hover:bg-app-accent transition-colors" />
      </div>

      {/* PR detail */}
      <main className="flex-1 min-w-0 flex flex-col bg-app-base">
        {!selectedPR ? (
          <div className="flex items-center justify-center h-full text-app-muted text-sm">
            {t.review.selectPrompt}
          </div>
        ) : (
          <>
            {/* PR header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-app-border shrink-0 bg-app-surface">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-key-blue bg-key-blue/10 px-1.5 py-0.5 rounded">
                    {selectedPR.locale}
                  </span>
                  <span className="text-app-muted text-xs">
                    #{selectedPR.number}
                  </span>
                </div>
                <h2 className="text-app-text font-medium text-sm truncate">
                  {selectedPR.title}
                </h2>
                <p className="text-app-muted text-xs">by @{selectedPR.author}</p>
              </div>
              <button
                onClick={() => openExternal(selectedPR.url)}
                className="text-app-accent text-xs hover:underline shrink-0"
              >
                {t.review.viewOnGitHub}
              </button>
            </div>

            {/* Key comparison */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center h-32 text-app-muted text-sm animate-pulse">
                  {t.review.loadingTranslations}
                </div>
              ) : rows.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-app-muted text-sm">
                  {t.review.noKeys}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-app-surface border-b border-app-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider w-56">
                        {t.review.colKey}
                      </th>
                      <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider">
                        {t.review.colSource}
                      </th>
                      <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider">
                        {t.review.colTranslation}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        className="border-b border-app-border hover:bg-app-surface transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-app-muted align-top">
                          {row.key}
                        </td>
                        <td className="px-4 py-3 text-app-muted text-sm align-top">
                          {row.source}
                        </td>
                        <td className="px-4 py-3 text-app-text text-sm align-top">
                          {row.translated}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Review actions */}
            {!submitted && (
              <div className="border-t border-app-border p-4 bg-app-surface shrink-0">
                {error && <p className="text-key-red text-xs mb-3">{error}</p>}

                {selectedPR.author !== currentUser ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {(
                        ["APPROVE", "COMMENT", "REQUEST_CHANGES"] as const
                      ).map((ev) => (
                        <button
                          key={ev}
                          onClick={() => setReviewEvent(ev)}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            reviewEvent === ev
                              ? ev === "APPROVE"
                                ? "bg-key-green text-black"
                                : ev === "REQUEST_CHANGES"
                                ? "bg-key-red text-white"
                                : "bg-app-accent text-white"
                              : "bg-app-surface-2 text-app-muted hover:text-app-text"
                          }`}
                        >
                          {ev === "APPROVE"
                            ? t.review.approve
                            : ev === "COMMENT"
                            ? t.review.comment
                            : t.review.requestChanges}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      placeholder={
                        reviewEvent === "REQUEST_CHANGES"
                          ? t.review.requestChangesPlaceholder
                          : t.review.commentPlaceholder
                      }
                      rows={3}
                      className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 text-app-text placeholder-app-muted text-sm resize-none focus:outline-none focus:border-app-accent transition-colors"
                    />

                    <button
                      onClick={handleSubmitReview}
                      disabled={isSubmitting}
                      className="px-5 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      {isSubmitting ? t.review.submitting : t.review.submitReview}
                    </button>
                  </div>
                ) : (
                  <p className="text-app-muted text-xs">{t.review.ownPRNotice}</p>
                )}
              </div>
            )}

            {submitted && (
              <div className="border-t border-app-border p-4 bg-app-surface shrink-0 text-center">
                <p className="text-key-green text-sm font-medium">
                  {t.review.reviewSubmitted}
                </p>
                <button
                  onClick={() => openExternal(selectedPR.url)}
                  className="text-app-accent text-xs hover:underline"
                >
                  {t.review.viewOnGitHub}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
