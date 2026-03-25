import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { openExternal } from "../../lib/tauri";
import { useT } from "../../i18n";

export default function TokenSetup() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const { saveToken, skipAuth, isLoading, error } = useAuthStore();
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) await saveToken(token.trim());
  };

  return (
    <div className="flex items-center justify-center h-full bg-app-base">
      <div className="w-full max-w-md px-8">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-3xl font-bold text-app-text mb-2">{t.app.name}</div>
          <p className="text-app-muted text-sm">{t.app.tagline}</p>
        </div>

        {/* Card */}
        <div className="bg-app-surface border border-app-border rounded-lg p-6">
          <h2 className="text-app-text font-semibold mb-1">{t.auth.title}</h2>
          <p className="text-app-muted text-sm mb-5">{t.auth.description}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-app-muted text-xs uppercase tracking-wider mb-1.5">
                {t.auth.tokenLabel}
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t.auth.tokenPlaceholder}
                  className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 pr-9 text-app-text placeholder-app-muted font-mono text-sm focus:outline-none focus:border-app-accent transition-colors"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text transition-colors"
                  tabIndex={-1}
                >
                  {showToken ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-key-red text-sm bg-key-red/10 border border-key-red/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!token.trim() || isLoading}
              className="w-full bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isLoading ? t.auth.verifying : t.auth.connect}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-app-border space-y-2">
            <p className="text-app-muted text-xs">
              {t.auth.requiredScopes}{" "}
              <code className="bg-app-surface-2 px-1 py-0.5 rounded text-app-text">repo</code>{" "}
              {t.auth.scopePrivate},{" "}
              <code className="bg-app-surface-2 px-1 py-0.5 rounded text-app-text">public_repo</code>{" "}
              {t.auth.scopePublic}.
            </p>
            <p className="text-app-muted text-xs">
              {t.auth.createTokenHint}{" "}
              <button
                onClick={() => openExternal("https://github.com/settings/tokens/new?scopes=repo&description=Lingoa")}
                className="text-app-accent hover:underline"
              >
                {t.auth.createTokenLink}
              </button>
            </p>
          </div>
        </div>

        <button
          onClick={skipAuth}
          className="w-full mt-3 bg-app-surface border border-app-border hover:border-app-accent/50 hover:text-app-text text-app-muted rounded-lg py-3 px-4 text-sm font-medium transition-colors"
        >
          {t.auth.skip}
          <span className="block text-app-muted/60 text-xs font-normal mt-0.5">{t.auth.skipHint}</span>
        </button>
      </div>
    </div>
  );
}
