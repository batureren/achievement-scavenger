import { useEffect, useState, ImgHTMLAttributes } from "react";
import { invoke } from "@tauri-apps/api/core";

const PROXY_HOSTS = [/(^|\.)wikia\.nocookie\.net$/i, /(^|\.)fandom\.com$/i];
const resolved = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function needsProxy(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return PROXY_HOSTS.some(re => re.test(host));
  } catch {
    return false;
  }
}

function fetchViaProxy(src: string): Promise<string> {
  const hit = resolved.get(src);
  if (hit) return Promise.resolve(hit);
  let job = pending.get(src);
  if (!job) {
    job = invoke<string>("fetch_image_data_url", { url: src })
      .then(dataUrl => {
        resolved.set(src, dataUrl);
        return dataUrl;
      })
      .finally(() => pending.delete(src));
    pending.set(src, job);
  }
  return job;
}

export function useProxiedSrc(src: string | undefined | null): { src: string; onError: () => void } {
  const initial = src ? resolved.get(src) || (needsProxy(src) ? "" : src) : "";
  const [current, setCurrent] = useState(initial);
  const [triedProxy, setTriedProxy] = useState(false);

  useEffect(() => {
    setTriedProxy(false);
    if (!src) { setCurrent(""); return; }
    const cached = resolved.get(src);
    if (cached) { setCurrent(cached); return; }
    if (!needsProxy(src)) { setCurrent(src); return; }
    let alive = true;
    setCurrent("");
    setTriedProxy(true);
    fetchViaProxy(src)
      .then(dataUrl => { if (alive) setCurrent(dataUrl); })
      .catch(() => { if (alive) setCurrent(src); });
    return () => { alive = false; };
  }, [src]);

  const onError = () => {
    if (!src || triedProxy) return;
    setTriedProxy(true);
    fetchViaProxy(src).then(setCurrent).catch(() => {});
  };

  return { src: current, onError };
}

type ProxiedImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | undefined | null };

export function ProxiedImg({ src, onError, ...rest }: ProxiedImgProps) {
  const proxied = useProxiedSrc(src);
  if (!proxied.src) return <span className={`${rest.className || ""} proxied-img-loading`.trim()} style={rest.style} aria-hidden="true" />;
  return (
    <img
      {...rest}
      src={proxied.src}
      referrerPolicy="no-referrer"
      onError={e => { proxied.onError(); onError?.(e); }}
    />
  );
}
