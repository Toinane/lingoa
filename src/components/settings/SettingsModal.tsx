import { useCallback, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import {
  useSettingsStore,
  THEME_REGISTRY,
  type Language,
} from "../../stores/settingsStore";
import { useT } from "../../i18n";
import { IconX } from "../Icons";
import AppModal from "../AppModal";

interface Props {
  onClose: () => void;
}

/** All available UI languages. Add entries here when adding new locale files. */
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

export default function SettingsModal({ onClose }: Props) {
  const { currentUser, logout, saveToken } = useAuthStore();
  const {
    theme,
    language,
    spellCheckDefault,
    prTipEnabled,
    setTheme,
    setLanguage,
    setSpellCheckDefault,
    setPrTipEnabled,
  } = useSettingsStore();
  const t = useT();

  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSaving, setTokenSaving] = useState(false);

  const handleSaveToken = useCallback(async () => {
    if (!tokenValue.trim()) return;
    setTokenSaving(true);
    setTokenError(null);
    try {
      await saveToken(tokenValue.trim());
      setShowTokenInput(false);
      setTokenValue("");
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : "Invalid token");
    } finally {
      setTokenSaving(false);
    }
  }, [tokenValue, saveToken]);

  return (
    <AppModal onClose={onClose}>
      <div className="w-full max-w-md bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h2 className="text-app-text font-semibold text-sm">
            {t.settings.title}
          </h2>
          <button
            onClick={onClose}
            className="text-app-muted hover:text-app-text transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-8rem)]">
          {/* Account */}
          <section className="px-5 py-4 border-b border-app-border">
            <h3 className="text-app-muted text-xs uppercase tracking-wider mb-3">
              {t.settings.account}
            </h3>

            {currentUser ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-app-text text-sm font-medium">
                      @{currentUser}
                    </div>
                    <div className="text-app-muted text-xs">
                      {t.settings.githubAccount}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowTokenInput((v) => !v);
                        setTokenError(null);
                      }}
                      className="text-xs px-3 py-1.5 bg-app-surface-2 hover:bg-app-border text-app-text rounded-md transition-colors"
                    >
                      {t.settings.changeToken}
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        onClose();
                      }}
                      className="text-xs px-3 py-1.5 bg-key-red/10 hover:bg-key-red/20 text-key-red rounded-md transition-colors"
                    >
                      {t.settings.signOut}
                    </button>
                  </div>
                </div>

                {showTokenInput && (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={tokenValue}
                      onChange={(e) => setTokenValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveToken();
                      }}
                      placeholder={t.auth.tokenPlaceholder}
                      autoFocus
                      className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 text-app-text placeholder-app-muted font-mono text-sm focus:outline-none focus:border-app-accent transition-colors"
                    />
                    {tokenError && (
                      <p className="text-key-red text-xs">{tokenError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveToken}
                        disabled={tokenSaving || !tokenValue.trim()}
                        className="text-xs px-3 py-1.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md transition-colors"
                      >
                        {tokenSaving ? t.settings.saving : t.settings.save}
                      </button>
                      <button
                        onClick={() => {
                          setShowTokenInput(false);
                          setTokenValue("");
                          setTokenError(null);
                        }}
                        className="text-xs px-3 py-1.5 text-app-muted hover:text-app-text transition-colors"
                      >
                        {t.settings.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-app-muted text-xs mb-3">
                  {t.auth.description}
                </p>
                <input
                  type="password"
                  value={tokenValue}
                  onChange={(e) => setTokenValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveToken();
                  }}
                  placeholder={t.auth.tokenPlaceholder}
                  className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 text-app-text placeholder-app-muted font-mono text-sm focus:outline-none focus:border-app-accent transition-colors"
                />
                {tokenError && (
                  <p className="text-key-red text-xs">{tokenError}</p>
                )}
                <button
                  onClick={handleSaveToken}
                  disabled={tokenSaving || !tokenValue.trim()}
                  className="w-full text-xs px-3 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white font-medium rounded-md transition-colors"
                >
                  {tokenSaving ? t.settings.saving : t.auth.connect}
                </button>
              </div>
            )}
          </section>

          {/* Appearance */}
          <section className="px-5 py-4 border-b border-app-border">
            <h3 className="text-app-muted text-xs uppercase tracking-wider mb-3">
              {t.settings.appearance}
            </h3>

            <div className="mb-4">
              <p className="text-app-text text-xs font-medium mb-2">
                {t.settings.theme}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {THEME_REGISTRY.map((th) => (
                  <button
                    key={th.id}
                    onClick={() => setTheme(th.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                      theme === th.id
                        ? "border-app-accent bg-app-accent/10 text-app-text"
                        : "border-app-border bg-app-surface-2 text-app-muted hover:text-app-text hover:border-app-muted"
                    }`}
                  >
                    <span className="text-lg leading-none">{th.icon}</span>
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-app-text text-xs font-medium mb-2">
                {t.settings.language}
              </p>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full bg-app-base border border-app-border rounded-md px-3 py-2 text-app-text text-sm focus:outline-none focus:border-app-accent transition-colors"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Editor */}
          <section className="px-5 py-4">
            <h3 className="text-app-muted text-xs uppercase tracking-wider mb-3">
              {t.settings.editor}
            </h3>
            <div className="space-y-3">
              <SettingRow
                label={t.settings.spellcheck}
                description={t.settings.spellcheckDesc}
                checked={spellCheckDefault}
                onChange={setSpellCheckDefault}
              />
              <SettingRow
                label={t.settings.prTip}
                description={t.settings.prTipDesc}
                checked={prTipEnabled}
                onChange={setPrTipEnabled}
              />
            </div>
          </section>
        </div>
      </div>
    </AppModal>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-app-text text-sm">{label}</p>
        <p className="text-app-muted text-xs mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-app-accent" : "bg-app-surface-2"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
