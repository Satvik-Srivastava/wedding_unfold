"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createDefaultWedding, parseWeddingSettings, type WeddingConfig } from "@/lib/wedding";
import { makeHandDrawnPortrait } from "@/lib/portrait";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "The wedding invitation could not be updated.";
}

export default function AdminPage() {
  const [config, setConfig] = useState<WeddingConfig>(() => createDefaultWedding());
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [legacyConfig, setLegacyConfig] = useState<WeddingConfig | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState<"bride" | "groom" | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        setSession(sessionData.session);

        const response = await fetch("/api/wedding", { cache: "no-store" });
        const payload: unknown = await response.json();
        if (response.status === 404) {
          if (active) setConfig(createDefaultWedding());
        } else if (!response.ok) {
          const message = typeof payload === "object" && payload !== null && "error" in payload ? String(payload.error) : "Wedding details could not be loaded.";
          throw new Error(message);
        } else if (active) {
          setConfig(parseWeddingSettings(payload));
        }
        try {
          const legacy = window.localStorage.getItem("unfold.wedding.v1");
          if (legacy && active) setLegacyConfig(parseWeddingSettings(JSON.parse(legacy) as unknown));
        } catch (legacyError) {
          if (active) setError(`This browser has older saved invitation data that could not be read: ${messageOf(legacyError)}`);
        }

        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);
          setError("");
          setStatus("");
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (loadError) {
        if (active) setError(messageOf(loadError));
      } finally {
        if (active) setReady(true);
      }
    };

    void initialize();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const setCoupleName = (index: 0 | 1, value: string) => {
    setConfig((current) => {
      const couple: [string, string] = [...current.couple];
      couple[index] = value;
      return { ...current, couple };
    });
    setStatus("");
  };

  const setParent = (key: keyof WeddingConfig["parents"], value: string) => {
    setConfig((current) => ({ ...current, parents: { ...current.parents, [key]: value } }));
    setStatus("");
    setError("");
  };

  const setEvent = (index: number, key: keyof WeddingConfig["events"][number], value: string) => {
    setConfig((current) => ({
      ...current,
      events: current.events.map((event, eventIndex) => (eventIndex === index ? { ...event, [key]: value } : event)),
    }));
    setStatus("");
    setError("");
  };

  const uploadPortrait = async (person: "bride" | "groom", file: File | undefined) => {
    if (!file) return;
    setProcessing(person);
    setError("");
    setStatus("");
    try {
      const portrait = await makeHandDrawnPortrait(file);
      setConfig((current) => ({ ...current, portraits: { ...current.portraits, [person]: portrait } }));
    } catch (uploadError) {
      setError(messageOf(uploadError));
    } finally {
      setProcessing(null);
    }
  };

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setSaving(true);
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      setPassword("");
    } catch (signInError) {
      setError(messageOf(signInError));
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!session) {
      setError("Sign in as an admin before saving.");
      return;
    }
    const invalidEvent = config.events.find((item) => {
      if (!item.start || !item.end) return false;
      const start = Date.parse(item.start);
      const end = Date.parse(item.end);
      return !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
    });
    if (invalidEvent) {
      setError(`The end time for ${invalidEvent.name} must be after its start time.`);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/wedding", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(config),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result ? String(result.error) : "Wedding details could not be saved.";
        throw new Error(message);
      }
      setConfig(parseWeddingSettings(config));
      setStatus("Your invitation is saved. Guests can now see these changes.");
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!session || !window.confirm("Clear the shared wedding details and portraits for every guest?")) return;
    setError("");
    setStatus("");
    setSaving(true);
    try {
      const defaults = createDefaultWedding();
      const response = await fetch("/api/wedding", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(defaults),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result ? String(result.error) : "The invitation could not be cleared.";
        throw new Error(message);
      }
      setConfig(defaults);
      setStatus("The shared wedding invitation has been cleared.");
    } catch (resetError) {
      setError(messageOf(resetError));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setError("");
    try {
      const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
    } catch (signOutError) {
      setError(messageOf(signOutError));
    }
  };

  const importLegacy = async () => {
    if (!session || !legacyConfig) return;
    setError("");
    setStatus("");
    setSaving(true);
    try {
      const response = await fetch("/api/wedding", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(legacyConfig),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result ? String(result.error) : "The saved invitation could not be imported.";
        throw new Error(message);
      }
      setConfig(legacyConfig);
      setLegacyConfig(null);
      setStatus("Your saved browser invitation is now shared with guests.");
    } catch (importError) {
      setError(messageOf(importError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-shell">
      <div className="admin-page">
        <header className="admin-topbar">
          <a className="admin-back" href="/" aria-label="Return to the invitation">
            unfold
          </a>
          <span className="admin-edition">wedding invitation · studio</span>
          <div className="admin-top-actions">
            {session && <button className="admin-reset" type="button" onClick={() => void signOut()}>sign out</button>}
            <a className="hand-btn" href="/">open invitation</a>
          </div>
        </header>

        <section className="admin-intro">
          <p className="admin-kicker">a little book, made yours</p>
          <h1>Set the scene.</h1>
          <p>Bring your names, family, portraits and celebration details into the pages of the book.</p>
          <div className="admin-notice" role="note">
            <span aria-hidden="true">✦</span>
            Wedding details are shared with guests. Only the signed-in admin can change them.
          </div>
        </section>

        {!ready ? (
          <p className="admin-loading" role="status">opening your invitation settings…</p>
        ) : !session ? (
          <form className="admin-login admin-section" onSubmit={signIn}>
            <div className="admin-section-heading">
              <span className="admin-number">✦</span>
              <div>
                <h2>For the hosts</h2>
                <p>Sign in to edit the invitation. Guest details remain public.</p>
              </div>
            </div>
            <label className="admin-field">
              <span>Admin email</span>
              <input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="admin-field">
              <span>Password</span>
              <input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="admin-save" type="submit" disabled={saving}>{saving ? "opening the studio…" : "sign in"}</button>
          </form>
        ) : (
          <>
          {legacyConfig && (
            <section className="admin-import admin-section">
              <div>
                <h2>Found your saved invitation</h2>
                <p>Import the details and portraits already saved in this browser to the shared invitation.</p>
              </div>
              <button className="admin-save" type="button" disabled={saving} onClick={() => void importLegacy()}>
                {saving ? "sharing your invitation…" : "import saved details"}
              </button>
            </section>
          )}
          <form className="admin-form" onSubmit={save}>
            <section className="admin-section">
              <div className="admin-section-heading">
                <span className="admin-number">01</span>
                <div>
                  <h2>The couple</h2>
                  <p>The names that appear on the cover and every invitation card.</p>
                </div>
              </div>
              <div className="admin-grid admin-grid-two">
                <label className="admin-field">
                  <span>Bride&apos;s name</span>
                  <input autoComplete="off" maxLength={70} value={config.couple[0]} onChange={(event) => setCoupleName(0, event.target.value)} placeholder="Enter a name" />
                </label>
                <label className="admin-field">
                  <span>Groom&apos;s name</span>
                  <input autoComplete="off" maxLength={70} value={config.couple[1]} onChange={(event) => setCoupleName(1, event.target.value)} placeholder="Enter a name" />
                </label>
              </div>
              <div className="admin-grid admin-grid-two admin-parents">
                {([
                  ["brideFather", "Bride's father"],
                  ["brideMother", "Bride's mother"],
                  ["groomFather", "Groom's father"],
                  ["groomMother", "Groom's mother"],
                ] as const).map(([key, label]) => (
                  <label className="admin-field" key={key}>
                    <span>{label}</span>
                    <input autoComplete="off" maxLength={70} value={config.parents[key]} onChange={(event) => setParent(key, event.target.value)} placeholder="Optional" />
                  </label>
                ))}
              </div>
              <div className="admin-grid admin-grid-two">
                <label className="admin-field">
                  <span>City</span>
                  <input autoComplete="address-level2" maxLength={80} value={config.city} onChange={(event) => { setConfig((current) => ({ ...current, city: event.target.value })); setStatus(""); setError(""); }} placeholder="City of the celebration" />
                </label>
                <label className="admin-field">
                  <span>RSVP by</span>
                  <input maxLength={80} value={config.rsvpBy} onChange={(event) => { setConfig((current) => ({ ...current, rsvpBy: event.target.value })); setStatus(""); setError(""); }} placeholder="Reply-by date" />
                </label>
              </div>
            </section>

            <section className="admin-section">
              <div className="admin-section-heading">
                <span className="admin-number">02</span>
                <div>
                  <h2>Portraits, drawn by hand</h2>
                  <p>Choose a clear photo; it is restyled on your device into a warm, ink-and-watercolour portrait. Save the invitation to share it with guests.</p>
                </div>
              </div>
              <div className="admin-portraits">
                {(["bride", "groom"] as const).map((person) => (
                  <div className="admin-portrait-card" key={person}>
                    <div className="admin-portrait-frame">
                      {config.portraits[person] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={config.portraits[person]} alt={`Hand-drawn ${person} portrait preview`} />
                      ) : (
                        <span className="admin-portrait-empty">portrait<br />awaits</span>
                      )}
                    </div>
                    <label className="admin-upload">
                      <span>{processing === person ? "drawing your portrait…" : `choose ${person}'s photo`}</span>
                      <input type="file" accept="image/*" disabled={processing !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadPortrait(person, file); }} />
                    </label>
                    {config.portraits[person] && (
                      <button
                        className="admin-remove"
                        type="button"
                        onClick={() => { setConfig((current) => ({ ...current, portraits: { ...current.portraits, [person]: "" } })); setStatus(""); setError(""); }}
                      >
                        remove portrait
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-section admin-events-section">
              <div className="admin-section-heading">
                <span className="admin-number">03</span>
                <div>
                  <h2>The celebrations</h2>
                  <p>Each event opens into its own page in the pop-up book. Leave a field blank to omit it from the invitation.</p>
                </div>
              </div>
              <div className="admin-events">
                {config.events.map((event, index) => (
                  <fieldset className="admin-event" key={event.key}>
                    <legend>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <input aria-label={`${event.key} event title`} maxLength={60} value={event.name} onChange={(change) => setEvent(index, "name", change.target.value)} />
                    </legend>
                    <div className="admin-grid admin-grid-two">
                      <label className="admin-field">
                        <span>Short invitation line</span>
                        <input maxLength={100} value={event.tagline} onChange={(change) => setEvent(index, "tagline", change.target.value)} placeholder="A line about this gathering" />
                      </label>
                      <label className="admin-field">
                        <span>Venue name</span>
                        <input maxLength={100} value={event.venue} onChange={(change) => setEvent(index, "venue", change.target.value)} placeholder="Venue" />
                      </label>
                      <label className="admin-field admin-field-wide">
                        <span>Full address</span>
                        <input autoComplete="street-address" maxLength={180} value={event.address} onChange={(change) => setEvent(index, "address", change.target.value)} placeholder="Street, area, city" />
                      </label>
                      <label className="admin-field">
                        <span>Starts</span>
                        <input type="datetime-local" value={event.start} onChange={(change) => setEvent(index, "start", change.target.value)} />
                      </label>
                      <label className="admin-field">
                        <span>Ends</span>
                        <input type="datetime-local" value={event.end} onChange={(change) => setEvent(index, "end", change.target.value)} />
                      </label>
                      <label className="admin-field admin-field-wide">
                        <span>What to wear</span>
                        <input maxLength={120} value={event.dress} onChange={(change) => setEvent(index, "dress", change.target.value)} placeholder="Optional dress note" />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>
            </section>

            <div className="admin-savebar">
              <div className="admin-feedback" aria-live="polite">
                {error && <span className="admin-error">{error}</span>}
                {status && <span className="admin-success">{status}</span>}
              </div>
              <button className="admin-reset" type="button" disabled={saving} onClick={() => void reset()}>clear shared details</button>
              <button className="admin-save" type="submit" disabled={saving}>{saving ? "saving the invitation…" : "save the invitation"}</button>
            </div>
          </form>
          </>
        )}

        <footer className="admin-footer">Made with care, page by page.</footer>
      </div>
    </main>
  );
}
