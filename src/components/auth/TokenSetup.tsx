import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useT } from "../../i18n";

export default function TokenSetup() {
  const [token, setToken] = useState("");
  const { saveToken, skipAuth, isLoading, error } = useAuthStore();
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) await saveToken(token.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-base">
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
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t.auth.tokenPlaceholder}
                className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 text-app-text placeholder-app-muted font-mono text-sm focus:outline-none focus:border-app-accent transition-colors"
                autoFocus
              />
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

          <div className="mt-4 pt-4 border-t border-app-border">
            <p className="text-app-muted text-xs">
              {t.auth.requiredScopes}{" "}
              <code className="bg-app-surface-2 px-1 py-0.5 rounded text-app-text">repo</code>{" "}
              {t.auth.scopePrivate},{" "}
              <code className="bg-app-surface-2 px-1 py-0.5 rounded text-app-text">public_repo</code>{" "}
              {t.auth.scopePublic}.
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
