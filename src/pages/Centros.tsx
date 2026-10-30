// src/pages/Centros.tsx — varios centros de trabajo con mapa
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { GoogleMap, useJsApiLoader, Circle } from "@react-google-maps/api";
import { MapPin, Plus, Save, Star, LocateFixed } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Pill, Notice, Empty, Loading, Input, Toggle } from "@/components/ui/kit";
import { fetchCenters, type Center } from "@/lib/data";
import { errMsg } from "@/lib/format";
import { t } from "@/i18n";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;
const MAPS_ID = import.meta.env.VITE_GOOGLE_MAPS_ID as string;
const LIBRARIES: ["marker"] = ["marker"];
const SPAIN = { lat: 40.2, lng: -3.7 };

function useCurrentTheme() {
  const get = () => (document.documentElement.classList.contains("dark") ? "dark" : "light") as "dark" | "light";
  const [theme, setTheme] = useState(get);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

type Draft = { id: string | null; name: string; address: string; lat: number | null; lng: number | null; radius: number; active: boolean; is_primary: boolean };

const toDraft = (c: Center): Draft => ({
  id: c.id, name: c.name, address: c.address ?? "", lat: c.center_lat, lng: c.center_lon, radius: c.radius_m, active: c.active, is_primary: c.is_primary,
});
const blank = (): Draft => ({ id: null, name: "", address: "", lat: null, lng: null, radius: 100, active: true, is_primary: false });

export default function Centros() {
  const { isAdmin, companyId, loading: profileLoading } = useProfile();
  const theme = useCurrentTheme();
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: MAPS_KEY ?? "", libraries: LIBRARIES });

  const [centers, setCenters] = useState<Center[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const load = useCallback(async (selectId?: string) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await fetchCenters(companyId);
      setCenters(list);
      const pick = list.find((c) => c.id === selectId) ?? list.find((c) => c.is_primary) ?? list[0];
      setDraft(pick ? toDraft(pick) : blank());
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { if (!profileLoading && isAdmin) load(); }, [profileLoading, isAdmin, load]);
  useEffect(() => { setMapReady(false); }, [theme]);

  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; setMapReady(true); }, []);

  // Pin arrastrable del centro que se está editando
  useEffect(() => {
    if (!mapReady || !mapRef.current || !isLoaded || !draft || draft.lat === null || draft.lng === null) return;
    if (!google.maps.marker?.AdvancedMarkerElement) return;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef.current,
      position: { lat: draft.lat, lng: draft.lng },
      gmpDraggable: true,
      title: draft.name || t("centers.defaultName"),
    });
    marker.addListener("dragend", () => {
      const pos = marker.position as google.maps.LatLng | google.maps.LatLngLiteral | null;
      if (!pos) return;
      const lat = typeof (pos as google.maps.LatLng).lat === "function" ? (pos as google.maps.LatLng).lat() : (pos as google.maps.LatLngLiteral).lat;
      const lng = typeof (pos as google.maps.LatLng).lng === "function" ? (pos as google.maps.LatLng).lng() : (pos as google.maps.LatLngLiteral).lng;
      setDraft((d) => (d ? { ...d, lat, lng } : d));
    });
    markerRef.current = marker;
    return () => { marker.map = null; };
  }, [draft?.lat, draft?.lng, draft?.id, isLoaded, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Centrar el mapa al cambiar de centro
  useEffect(() => {
    if (!mapRef.current || !draft) return;
    if (draft.lat !== null && draft.lng !== null) { mapRef.current.panTo({ lat: draft.lat, lng: draft.lng }); mapRef.current.setZoom(16); }
  }, [draft?.id, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMapClick(e: google.maps.MapMouseEvent) {
    if (!e.latLng || !draft) return;
    setDraft({ ...draft, lat: e.latLng.lat(), lng: e.latLng.lng() });
  }

  function locateMe() {
    if (!navigator.geolocation || !draft) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDraft((d) => (d ? { ...d, lat: p.coords.latitude, lng: p.coords.longitude } : d));
        mapRef.current?.panTo({ lat: p.coords.latitude, lng: p.coords.longitude });
        mapRef.current?.setZoom(17);
      },
      () => setMsg({ tone: "error", text: t("centers.noLocation") }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function save() {
    if (!draft) return;
    setMsg(null);
    if (!draft.name.trim()) { setMsg({ tone: "error", text: t("errors.db.centerNeedsName") }); return; }
    if (draft.lat === null || draft.lng === null) { setMsg({ tone: "error", text: t("errors.db.centerNeedsLocation") }); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_upsert_work_center", {
      p_id: draft.id, p_name: draft.name.trim(), p_address: draft.address.trim() || null,
      p_lat: draft.lat, p_lon: draft.lng, p_radius_m: draft.radius, p_active: draft.active,
    });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("centers.saved") });
    load(data as string);
  }

  async function makePrimary() {
    if (!draft?.id) return;
    const { error } = await supabase.rpc("admin_set_primary_center", { p_id: draft.id });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("centers.primaryChanged") });
    load(draft.id);
  }

  if (!profileLoading && !isAdmin) return <Navigate to="/" replace />;
  if (profileLoading || loading) return <Loading />;

  const original = centers.find((c) => c.id === draft?.id);
  const dirty = !!draft && (!original
    ? true
    : draft.name !== original.name || draft.address !== (original.address ?? "") || draft.lat !== original.center_lat ||
      draft.lng !== original.center_lon || draft.radius !== original.radius_m || draft.active !== original.active);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.centers")}
        subtitle={t("centers.subtitle")}
        actions={<Button variant="primary" onClick={() => { setDraft(blank()); setMsg(null); }}><Plus className="w-4 h-4" />{t("centers.new")}</Button>}
      />

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        <Card className="!p-3 h-fit">
          {centers.length === 0 ? <Empty>{t("centers.none")}</Empty> : (
            <div className="space-y-1">
              {centers.map((c) => (
                <button key={c.id} type="button" onClick={() => { setDraft(toDraft(c)); setMsg(null); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition cursor-pointer ${draft?.id === c.id ? "border-accent bg-accent/10" : "border-transparent hover:bg-slate-100 dark:hover:bg-white/5"}`}>
                  <div className="flex items-center gap-2">
                    <MapPin className={`w-4 h-4 shrink-0 ${c.active ? "text-accent" : "text-slate-400"}`} />
                    <span className={`text-sm font-medium truncate ${c.active ? "text-slate-900 dark:text-white" : "text-slate-400 line-through"}`}>{c.name}</span>
                    {c.is_primary && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-6 truncate">{c.address || t("centers.noAddress")} · {c.radius_m} m</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {draft && (
          <Card title={draft.id ? draft.name || t("cells.center") : t("centers.new")} icon={<MapPin className="w-4 h-4" />}
            actions={draft.is_primary ? <Pill className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"><Star className="w-3 h-3" />{t("emp.primary")}</Pill> : undefined}>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input label={t("settingsWeb.holName")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("centers.namePh")} />
                <Input label={t("settingsWeb.address")} hint={`(${t("common.optional")})`} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
              </div>

              {loadError || !MAPS_KEY ? (
                <Notice tone="warn">{t("centers.mapError")}</Notice>
              ) : isLoaded ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
                  <GoogleMap
                    key={theme}
                    mapContainerStyle={{ width: "100%", height: "380px" }}
                    center={draft.lat !== null && draft.lng !== null ? { lat: draft.lat, lng: draft.lng } : SPAIN}
                    zoom={draft.lat !== null ? 16 : 6}
                    options={{ mapId: MAPS_ID, colorScheme: theme === "dark" ? "DARK" : "LIGHT", streetViewControl: false, mapTypeControl: false, clickableIcons: false }}
                    onClick={onMapClick}
                    onLoad={onMapLoad}
                  >
                    {centers.filter((c) => c.id !== draft.id && c.active).map((c) => (
                      <Circle key={c.id} center={{ lat: c.center_lat, lng: c.center_lon }} radius={c.radius_m}
                        options={{ fillColor: "#a855f7", fillOpacity: 0.08, strokeColor: "#a855f7", strokeOpacity: 0.4, strokeWeight: 1, clickable: false }} />
                    ))}
                    {draft.lat !== null && draft.lng !== null && (
                      <Circle center={{ lat: draft.lat, lng: draft.lng }} radius={draft.radius}
                        options={{ fillColor: "#22d3ee", fillOpacity: 0.14, strokeColor: "#22d3ee", strokeOpacity: 0.7, strokeWeight: 2, clickable: false }} />
                    )}
                  </GoogleMap>
                  {draft.lat === null && (
                    <div className="flex items-center justify-center h-10 bg-amber-500/5 border-t border-amber-500/20">
                      <p className="text-xs text-amber-600 dark:text-amber-400">{t("centers.clickMap")}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-64 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center"><p className="text-sm text-slate-400">{t("centers.loadingMap")}</p></div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={locateMe}><LocateFixed className="w-3.5 h-3.5" />{t("centers.useMine")}</Button>
                {draft.lat !== null && draft.lng !== null && (
                  <span className="text-[11px] font-mono text-slate-400">{draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}</span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("centers.radius")}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{draft.radius} m</span>
                </div>
                <input type="range" min={30} max={1000} step={10} value={draft.radius}
                  onChange={(e) => setDraft({ ...draft, radius: Number(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-cyan-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("centers.radiusHint")}</p>
              </div>

              {draft.id && !draft.is_primary && (
                <Toggle checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label={t("centers.active")}
                  description={t("centers.activeDesc")} />
              )}

              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

              <div className="flex flex-wrap gap-2 justify-end">
                {draft.id && !draft.is_primary && draft.active && original?.active && (
                  <Button onClick={makePrimary}><Star className="w-4 h-4" />{t("centers.makePrimary")}</Button>
                )}
                <Button variant="primary" disabled={saving || !dirty} onClick={save}><Save className="w-4 h-4" />{saving ? t("resetWeb.saving") : t("common.save")}</Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Notice tone="info">{t("centers.footer")}</Notice>
    </div>
  );
}
