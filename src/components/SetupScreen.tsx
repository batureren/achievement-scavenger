import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { unwrapXboxData } from "../utils";

interface SetupScreenProps {
  onKeySaved: (k: string, ra: {user: string, key: string}, xbox: {apiKey: string, xuid: string, gamertag: string}) => void;
  currentKey: string;
  currentRa: {user: string, key: string};
  currentXbox: {apiKey: string, xuid: string, gamertag: string};
}

export function SetupScreen({ onKeySaved, currentKey, currentRa, currentXbox }: SetupScreenProps) {
  const [inputKey, setInputKey] = useState(currentKey || "");
  const [raUser, setRaUser] = useState(currentRa?.user || "");
  const [raKey, setRaKey] = useState(currentRa?.key || "");
  const [xboxKey, setXboxKey] = useState(currentXbox?.apiKey || "");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handleSave = async () => {
    const trimmedSteam = inputKey.trim();
    const trimmedRaU = raUser.trim();
    const trimmedRaK = raKey.trim();
    const trimmedXbox = xboxKey.trim();

    if (!trimmedSteam && !trimmedRaU && !trimmedXbox) { setError("Please enter credentials for at least one platform (Steam, RetroAchievements, or Xbox)."); return; }
    if (trimmedSteam && trimmedSteam.length !== 32) { setError("Steam API keys are exactly 32 characters."); return; }
    if (trimmedRaU && !trimmedRaK) { setError("RetroAchievements Web API Key is missing."); return; }

    setIsValidating(true);
    setError("");
    try {
      if (trimmedSteam) await invoke("save_api_key", { key: trimmedSteam });
      if (trimmedRaU && trimmedRaK) await invoke("save_ra_credentials", { data: JSON.stringify({ user: trimmedRaU, key: trimmedRaK }) });

      let xboxResult = { apiKey: "", xuid: "", gamertag: "" };
      if (trimmedXbox) {
        const accountStr = await invoke<string>("get_xbox_account", { apiKey: trimmedXbox });
        const rawData = JSON.parse(accountStr || "{}");
        
        if (rawData.error) {
          const detail = rawData.details ? ` (${rawData.details})` : "";
          setError(rawData.error === "INVALID_KEY" ? "Invalid OpenXBL API key." : `Could not verify Xbox API key. Please check it and try again.${detail}`);
          setIsValidating(false);
          return;
        }

        const accountData = unwrapXboxData(rawData);
        const profile = Array.isArray(accountData.profileUsers) ? accountData.profileUsers[0] : accountData;
        const xuid = profile?.id || profile?.xuid || "";
        const settings = Array.isArray(profile?.settings) ? profile.settings : [];
        const gamertag = settings.find((s: any) => s.id === "Gamertag")?.value || profile?.gamertag || "";
        
        if (!xuid) { setError("Could not resolve XUID from OpenXBL response."); setIsValidating(false); return; }
        
        xboxResult = { apiKey: trimmedXbox, xuid: xuid.toString(), gamertag };
        await invoke("save_xbox_credentials", { data: JSON.stringify(xboxResult) });
      }

      onKeySaved(trimmedSteam, { user: trimmedRaU, key: trimmedRaK }, xboxResult);
    } catch (e) {
      setError("Failed to save keys. Please try again.");
      setIsValidating(false);
    }
  };

  return (
    <div className="setup-screen" style={{ overflowY: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
        <img src="/icon.svg" alt="Achievement Scavenger Logo" style={{ width: "80px", height: "80px" }} />
        <h1 className="app-title">Achievement Scavenger</h1>
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "32px", maxWidth: "480px", width: "100%", display: "flex", flexDirection: "column", gap: "24px", zIndex: 1 }}>
        
        {/* Steam Block */}
        <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "20px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>🎮 Steam Tracking</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Get a free key from <a href="#" onClick={(e) => { e.preventDefault(); open("https://steamcommunity.com/dev/apikey"); }}>steamcommunity.com/dev/apikey</a>.</p>
          <input type="password" placeholder="Steam API Key (32 Chars)..." value={inputKey} onChange={e => { setInputKey(e.target.value); setError(""); }} style={{ padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }} />
        </div>

        {/* RA Block */}
        <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "20px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", color: "#f59e0b" }}>🕹️ RetroAchievements</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Find your "Web API Key" in your <a href="#" onClick={(e) => { e.preventDefault(); open("https://retroachievements.org/controlpanel.php"); }}>RA Control Panel</a> settings.</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="text" placeholder="RA Username..." value={raUser} onChange={e => { setRaUser(e.target.value); setError(""); }} style={{ flex: 1, padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", minWidth: "0" }} />
            <input type="password" placeholder="RA Web API Key..." value={raKey} onChange={e => { setRaKey(e.target.value); setError(""); }} style={{ flex: 2, padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", minWidth: "0" }} />
          </div>
        </div>

        {/* Xbox Block */}
        <div>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", color: "#107c10" }}>🎮 Xbox Live</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Get a free API key from <a href="#" onClick={(e) => { e.preventDefault(); open("https://xbl.io"); }}>xbl.io</a> (sign in with your Microsoft account).</p>
          <input type="password" placeholder="OpenXBL API Key..." value={xboxKey} onChange={e => { setXboxKey(e.target.value); setError(""); }} style={{ padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }} />
        </div>

        {error && <p style={{ color: "var(--accent-red)", fontSize: "0.85rem", margin: 0 }}>⚠ {error}</p>}

        <button onClick={handleSave} disabled={isValidating} style={{ padding: "10px", borderRadius: "6px", backgroundColor: isValidating ? "var(--border-color)" : "var(--accent-green)", color: isValidating ? "var(--text-muted)" : "#000", border: "none", fontWeight: "700", fontSize: "0.95rem", cursor: isValidating ? "not-allowed" : "pointer", transition: "background-color 0.2s" }}>
          {isValidating ? "Saving..." : "Save & Continue"}
        </button>

        <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: 0, lineHeight: "1.5" }}>
          🔒 Your keys are stored locally. You can provide Steam, RA, Xbox, or any combination.
        </p>
      </div>
    </div>
  );
}