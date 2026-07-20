import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { unwrapXboxData } from "../utils";
import { SteamIcon, RAIcon, XboxIcon, PSNIcon } from "./Icons";

interface PsnSetupResult { accessToken: string; accountId: string; npsso: string; refreshToken?: string; expiresAt?: number; }

interface SetupScreenProps {
  onKeySaved: (k: string, ra: {user: string, key: string}, xbox: {apiKey: string, xuid: string, gamertag: string}, psn: PsnSetupResult) => void;
  currentKey: string;
  currentRa: {user: string, key: string};
  currentXbox: {apiKey: string, xuid: string, gamertag: string};
  currentPsn?: PsnSetupResult;
}

export function SetupScreen({ onKeySaved, currentKey, currentRa, currentXbox, currentPsn }: SetupScreenProps) {
  const [inputKey, setInputKey] = useState(currentKey || "");
  const [raUser, setRaUser] = useState(currentRa?.user || "");
  const [raKey, setRaKey] = useState(currentRa?.key || "");
  const [xboxKey, setXboxKey] = useState(currentXbox?.apiKey || "");
  const [psnNpsso, setPsnNpsso] = useState(currentPsn?.npsso || "");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handleSave = async () => {
    const trimmedSteam = inputKey.trim();
    const trimmedRaU = raUser.trim();
    const trimmedRaK = raKey.trim();
    const trimmedXbox = xboxKey.trim();

    const trimmedNpsso = psnNpsso.trim();
    if (!trimmedSteam && !trimmedRaU && !trimmedXbox && !trimmedNpsso) { setError("Please enter credentials for at least one platform (Steam, RA, Xbox, or PSN)."); return; }
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

      let psnResult: PsnSetupResult = { accessToken: "", accountId: "", npsso: "" };
      if (trimmedNpsso) {
        const authStr = await invoke<string>("authenticate_psn", { npsso: trimmedNpsso });
        const parsedAuth = JSON.parse(authStr);
        if (parsedAuth.accessToken && parsedAuth.accountId) {
          psnResult = { accessToken: parsedAuth.accessToken, accountId: parsedAuth.accountId, npsso: trimmedNpsso, refreshToken: parsedAuth.refreshToken, expiresAt: parsedAuth.expiresAt };
          await invoke("save_psn_credentials", { data: JSON.stringify(psnResult) });
        } else {
          setError("Failed to verify NPSSO token.");
          setIsValidating(false);
          return;
        }
      }

      onKeySaved(trimmedSteam, { user: trimmedRaU, key: trimmedRaK }, xboxResult, psnResult);
    } catch (e: any) {
      console.error("Setup Error:", e);
      setError(typeof e === "string" ? e : "Failed to save keys. Please try again.");
      setIsValidating(false);
    }
  };

  return (
    <div className="setup-screen">
      <div id="setup-screen-logo">
        <img src="/icon.svg" alt="Achievement Scavenger Logo" style={{ width: "80px", height: "80px" }} />
        <h1 className="app-title">Achievement Scavenger</h1>
      </div>

      <div className="setup-platforms">
        
        {/* Steam Block */}
        <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "20px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}><SteamIcon size={22} /> Steam Tracking</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Get a free key from <a href="#" onClick={(e) => { e.preventDefault(); open("https://steamcommunity.com/dev/apikey"); }}>steamcommunity.com/dev/apikey</a>.</p>
          <input type="password" placeholder="Steam API Key (32 Chars)..." value={inputKey} onChange={e => { setInputKey(e.target.value); setError(""); }} style={{ padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }} />
        </div>

        {/* RA Block */}
        <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "20px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", color: "#f59e0b" }}><RAIcon size={24} /> RetroAchievements</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Find your "Web API Key" in your <a href="#" onClick={(e) => { e.preventDefault(); open("https://retroachievements.org/controlpanel.php"); }}>RA Control Panel</a> settings.</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="text" placeholder="RA Username..." value={raUser} onChange={e => { setRaUser(e.target.value); setError(""); }} style={{ flex: 1, padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", minWidth: "0" }} />
            <input type="password" placeholder="RA Web API Key..." value={raKey} onChange={e => { setRaKey(e.target.value); setError(""); }} style={{ flex: 2, padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", minWidth: "0" }} />
          </div>
        </div>

        {/* Xbox Block */}
        <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "20px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", color: "#107c10" }}><XboxIcon size={22} /> Xbox Live</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Get a free API key from <a href="#" onClick={(e) => { e.preventDefault(); open("https://xbl.io"); }}>xbl.io</a> (sign in with your Microsoft account).</p>
          <input type="password" placeholder="OpenXBL API Key..." value={xboxKey} onChange={e => { setXboxKey(e.target.value); setError(""); }} style={{ padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }} />
        </div>

        {/* PSN Block */}
        <div>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", color: "#00439c" }}><PSNIcon size={20} /> PlayStation Network</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1.6", marginBottom: "12px" }}>Login to <a href="#" onClick={(e) => { e.preventDefault(); open("https://playstation.com"); }}>PlayStation.com</a>, then open <a href="#" onClick={(e) => { e.preventDefault(); open("https://ca.account.sony.com/api/v1/ssocookie"); }}>this link</a>. Copy the `npsso` value (exactly 64 chars) here.</p>
          <input type="password" placeholder="NPSSO Token..." value={psnNpsso} onChange={e => { setPsnNpsso(e.target.value); setError(""); }} style={{ padding: "10px 14px", borderRadius: "6px", border: `1px solid var(--border-color)`, backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }} />
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