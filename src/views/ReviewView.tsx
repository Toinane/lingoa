import React, { useState, useCallback, useEffect } from "react";
import { usePRStore } from "../stores/prStore";
import { openExternal } from "../lib/tauri";
import { useRepoStore } from "../stores/repoStore";
import { useAuthStore } from "../stores/authStore";
import { fetchPRReviewData, submitReview } from "../lib/github";
import { useT, interp } from "../i18n";
import { getTargetRepo } from "../types";
import { decodePathFromBranch } from "../lib/git";
import { useResizableSidebar } from "../hooks/useResizableSidebar";
import RowDetailView from "../components/review/RowDetailView";
import type { KeyRow } from "../lib/tauri";
import type { TranslationPR } from "../types";
import type { Annotation } from "../components/review/AnnotationPanel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSuggestionBody(rawLine: string): string {
  return "```suggestion\n" + rawLine + "\n```";
}

function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  return words.length <= max ? text : words.slice(0, max).join(" ") + "…";
}

// ─── PR list item ─────────────────────────────────────────────────────────────

const PRListItem = React.memo(function PRListItem({
  pr,
  isSelected,
  currentUser,
  onSelect,
}: {
  pr: TranslationPR;
  isSelected: boolean;
  currentUser: string | null;
  onSelect: (pr: TranslationPR) => void;
}) {
  const t = useT();
  return (
    <button
      onClick={() => onSelect(pr)}
      className={`w-full px-3 py-3 text-left border-b border-app-border transition-colors ${
        isSelected
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
  );
});

// ─── Main view ────────────────────────────────────────────────────────────────

interface DetailState {
  rows: KeyRow[];
  isNewTranslation: boolean;
  isLoading: boolean;
}

interface ReviewFormState {
  event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
  body: string;
  isSubmitting: boolean;
  error: string | null;
  justSubmitted: boolean;
}

const DETAIL_INITIAL: DetailState = {
  rows: [],
  isNewTranslation: false,
  isLoading: false,
};
const FORM_INITIAL: ReviewFormState = {
  event: "COMMENT",
  body: "",
  isSubmitting: false,
  error: null,
  justSubmitted: false,
};

export default function ReviewView() {
  const { openPRs, isLoading, markReviewed, fetchPRs } = usePRStore();
  const { repoInfo } = useRepoStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const t = useT();

  const { width: sidebarWidth, handleResizeStart } = useResizableSidebar(
    "lingoa-review-sidebar-width",
    288,
  );

  const [selectedPR, setSelectedPR] = useState<TranslationPR | null>(null);
  const [selectedRow, setSelectedRow] = useState<KeyRow | null>(null);
  const [annotations, setAnnotations] = useState<Map<string, Annotation>>(
    new Map(),
  );
  const [detail, setDetail] = useState<DetailState>(DETAIL_INITIAL);
  const [form, setForm] = useState<ReviewFormState>(FORM_INITIAL);

  const owner = repoInfo ? getTargetRepo(repoInfo).owner : undefined;
  const repo = repoInfo ? getTargetRepo(repoInfo).repo : undefined;

  useEffect(() => {
    if (owner && repo) fetchPRs(owner, repo);
  }, [owner, repo, fetchPRs]);

  const selectPR = useCallback(
    async (pr: TranslationPR) => {
      if (!owner || !repo) return;
      setSelectedPR(pr);
      setSelectedRow(null);
      setAnnotations(new Map());
      setDetail({ rows: [], isNewTranslation: false, isLoading: true });
      setForm(FORM_INITIAL);

      try {
        const sourcePath = decodePathFromBranch(pr.encodedFilePath);
        const prFiles = await fetchPRReviewData(
          owner,
          repo,
          pr.number,
          pr.headSha,
          pr.baseBranch,
          sourcePath,
        );
        setDetail({
          rows: prFiles.flatMap((f) => f.rows),
          isNewTranslation:
            prFiles.length > 0 && prFiles.every((f) => f.isNewFile),
          isLoading: false,
        });
      } catch (e) {
        setDetail(DETAIL_INITIAL);
        setForm((s) => ({
          ...s,
          error: e instanceof Error ? e.message : "Failed to load PR details",
        }));
      }
    },
    [owner, repo],
  );

  const saveAnnotation = useCallback((key: string, annotation: Annotation) => {
    setAnnotations((prev) => new Map(prev).set(key, annotation));
  }, []);

  const removeAnnotation = useCallback((key: string) => {
    setAnnotations((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleSubmitReview = async () => {
    if (!owner || !repo || !selectedPR) return;
    if (form.event === "REQUEST_CHANGES" && !form.body.trim()) {
      setForm((s) => ({ ...s, error: t.review.requiresComment }));
      return;
    }
    setForm((s) => ({ ...s, isSubmitting: true, error: null }));

    try {
      const inlineComments: { path: string; line: number; body: string }[] = [];
      const fallbackLines: string[] = [];

      for (const [key, annotation] of annotations) {
        const row = detail.rows.find((r) => r.key === key);
        if (!row) continue;
        const commentBody =
          annotation.type === "suggestion"
            ? buildSuggestionBody(annotation.body)
            : annotation.body;
        if (row.line > 0) {
          inlineComments.push({
            path: row.path,
            line: row.line,
            body: commentBody,
          });
        } else {
          fallbackLines.push(`**\`${key}\`:** ${annotation.body}`);
        }
      }

      const finalBody = fallbackLines.length
        ? [form.body, ...fallbackLines].filter(Boolean).join("\n\n")
        : form.body;

      await submitReview(
        owner,
        repo,
        selectedPR.number,
        selectedPR.headSha,
        form.event,
        finalBody,
        inlineComments,
      );
      markReviewed(selectedPR.number);
      setAnnotations(new Map());
      setForm({
        event: "COMMENT",
        body: "",
        isSubmitting: false,
        error: null,
        justSubmitted: true,
      });
    } catch (e) {
      setForm((s) => ({
        ...s,
        isSubmitting: false,
        error: e instanceof Error ? e.message : "Failed to submit review",
      }));
    }
  };

  return (
    <div className="flex h-full">
      {/* PR list sidebar */}
      <aside
        className="bg-app-surface flex flex-col shrink-0"
        style={{ width: sidebarWidth }}
      >
        <div className="px-3 py-3 border-b border-app-border shrink-0">
          <h3 className="text-app-text font-medium text-sm">
            {t.review.sidebarTitle}
          </h3>
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
              <PRListItem
                key={pr.number}
                pr={pr}
                isSelected={selectedPR?.number === pr.number}
                currentUser={currentUser}
                onSelect={selectPR}
              />
            ))
          )}
        </div>
      </aside>

      {/* Resize handle */}
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
                <p className="text-app-muted text-xs">
                  by @{selectedPR.author}
                </p>
              </div>
              <button
                onClick={() => openExternal(selectedPR.url)}
                className="text-app-accent text-xs hover:underline shrink-0"
              >
                {t.review.viewOnGitHub}
              </button>
            </div>

            {/* Key comparison table / row detail */}
            <div className="flex-1 overflow-y-auto">
              {detail.isLoading ? (
                <div className="flex items-center justify-center h-32 text-app-muted text-sm animate-pulse">
                  {t.review.loadingTranslations}
                </div>
              ) : detail.rows.length === 0 && !form.error ? (
                <div className="flex items-center justify-center h-32 text-app-muted text-sm">
                  {t.review.noKeys}
                </div>
              ) : selectedRow ? (
                <RowDetailView
                  row={selectedRow}
                  rows={detail.rows}
                  annotations={annotations}
                  onSave={saveAnnotation}
                  onRemove={removeAnnotation}
                  onSelectRow={setSelectedRow}
                  onBack={() => setSelectedRow(null)}
                  isNewTranslation={detail.isNewTranslation}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-app-surface border-b border-app-border z-10">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider w-48">
                        {t.review.colKey}
                      </th>
                      <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider">
                        {t.review.colSource}
                      </th>
                      {!detail.isNewTranslation && (
                        <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider">
                          {t.review.colPrevious}
                        </th>
                      )}
                      <th className="text-left px-4 py-2.5 text-app-muted text-xs font-medium uppercase tracking-wider">
                        {t.review.colTranslation}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((row) => {
                      const hasAnnotation = annotations.has(row.key);
                      const annotation = annotations.get(row.key);
                      return (
                        <tr
                          key={row.key}
                          onClick={() => setSelectedRow(row)}
                          className="border-b border-app-border transition-colors hover:bg-app-surface cursor-pointer"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-app-muted align-top">
                            {row.key}
                            {hasAnnotation && (
                              <span
                                className={`ml-1.5 text-[10px] font-sans px-1 py-0.5 rounded ${
                                  annotation?.type === "suggestion"
                                    ? "bg-key-blue/15 text-key-blue"
                                    : "bg-app-accent/15 text-app-accent"
                                }`}
                              >
                                {annotation?.type === "suggestion"
                                  ? t.review.annotationTypeSuggestion
                                  : t.review.annotationTypeComment}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-app-muted text-sm align-top">
                            {truncateWords(row.source, 100)}
                          </td>
                          {!detail.isNewTranslation && (
                            <td className="px-4 py-3 text-sm align-top">
                              {row.previous != null ? (
                                <span className="text-app-muted">
                                  {truncateWords(row.previous, 100)}
                                </span>
                              ) : (
                                <span className="text-app-muted/40 italic text-xs">
                                  {t.review.newKey}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 text-app-text text-sm align-top">
                            {truncateWords(row.translated, 100)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Review actions */}
            {!form.justSubmitted && (
              <div className="border-t border-app-border p-4 bg-app-surface shrink-0">
                {form.error && (
                  <p className="text-key-red text-xs mb-3">{form.error}</p>
                )}

                {selectedPR.author !== currentUser ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {(["APPROVE", "COMMENT", "REQUEST_CHANGES"] as const).map(
                        (ev) => (
                          <button
                            key={ev}
                            onClick={() =>
                              setForm((s) => ({ ...s, event: ev }))
                            }
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              form.event === ev
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
                        ),
                      )}
                    </div>

                    <textarea
                      value={form.body}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, body: e.target.value }))
                      }
                      placeholder={
                        form.event === "REQUEST_CHANGES"
                          ? t.review.requestChangesPlaceholder
                          : t.review.commentPlaceholder
                      }
                      rows={3}
                      className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 text-app-text placeholder-app-muted text-sm resize-none focus:outline-none focus:border-app-accent transition-colors"
                    />

                    <div className="flex items-center justify-between">
                      {annotations.size > 0 ? (
                        <p className="text-app-muted text-xs">
                          {interp(
                            annotations.size === 1
                              ? t.review.annotationIncluded
                              : t.review.annotationsIncluded,
                            { n: annotations.size },
                          )}
                        </p>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={handleSubmitReview}
                        disabled={form.isSubmitting}
                        className="px-5 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
                      >
                        {form.isSubmitting
                          ? t.review.submitting
                          : t.review.submitReview}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-app-muted text-xs">
                    {t.review.ownPRNotice}
                  </p>
                )}
              </div>
            )}

            {form.justSubmitted && (
              <div className="border-t border-app-border p-4 bg-app-surface shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-key-green text-sm font-medium">
                    {t.review.reviewSubmitted}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openExternal(selectedPR.url)}
                      className="text-app-accent text-xs hover:underline"
                    >
                      {t.review.viewOnGitHub}
                    </button>
                    <button
                      onClick={() =>
                        setForm((s) => ({ ...s, justSubmitted: false }))
                      }
                      className="px-3 py-1.5 bg-app-surface-2 text-app-muted hover:text-app-text text-xs rounded transition-colors"
                    >
                      {t.review.submitAnother}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
