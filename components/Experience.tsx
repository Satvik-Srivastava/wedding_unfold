"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import Book from "./Book";
import EventCard from "./EventCard";
import Rsvp from "./Rsvp";
import { applyWedding, createDefaultWedding, WEDDING, eventByKey, fmtDay, parseWeddingSettings, setGuest } from "@/lib/wedding";
import { HandArrow, HandUnderline } from "./Hand";
import { logicalOf } from "@/lib/fold";
import { ROOMS } from "@/lib/invite";
import { book } from "@/lib/store";
import { buildTextures, type BookTextures } from "@/lib/textures";
import { look } from "@/lib/style";

const FONT = "Caveat";

export default function Experience() {
  const [tex, setTex] = useState<BookTextures | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [room, setRoom] = useState(0); // logical index
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<string | null>(null); // event key whose invite card is open
  const [rsvp, setRsvp] = useState<string | null>(null); // "" = open, or an event key to pre-tick
  const writing = card !== null || rsvp !== null;
  const drag = useRef({ x: 0, startX: 0, active: false });

  // Draw every surface once the handwriting font is ready (loose pen, a little colour).
  useEffect(() => {
    let alive = true;
    const build = async () => {
      try {
        const response = await fetch("/api/wedding", { cache: "no-store" });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = typeof result === "object" && result !== null && "error" in result ? String(result.error) : "Wedding details could not be loaded.";
          throw new Error(message);
        }
        applyWedding(parseWeddingSettings(result));
        setSettingsError("");
      } catch (error) {
        applyWedding(createDefaultWedding());
        if (alive) setSettingsError(error instanceof Error ? error.message : "The invitation settings could not be loaded.");
      }
      look.pen = "sketchy";
      look.color = true;
      if (alive) setTex(buildTextures(`${FONT}, cursive`));
    };
    (async () => {
      try {
        await Promise.all([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`500 64px ${FONT}`)]);
      } catch {
        /* fall back to whatever cursive font is around */
      }
      // A personal link can write a guest's name on the cover.
      setGuest(new URLSearchParams(window.location.search).get("to") ?? "");
      await build();
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Step round the circle: +1 = next room. The target keeps counting so the carousel always
  // turns the short way, and wraps from the last room back to the first.
  const step = useCallback((dir: number) => {
    book.target = Math.round(book.target) - dir;
    setRoom(logicalOf(book.target));
  }, []);

  const setBookOpen = useCallback((v: boolean) => {
    book.openTarget = v ? 1 : 0;
    setOpen(v);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (writing) return; // the journal sheet handles its own keys
      if (ev.key === "ArrowRight") {
        if (!open) setBookOpen(true);
        else step(1);
      } else if (ev.key === "ArrowLeft") {
        if (open) step(-1);
      } else if (ev.key === "Enter" || ev.key === " ") {
        setBookOpen(!open);
      } else if (ev.key === "Escape") setBookOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, setBookOpen, writing]);

  // Drag sideways to page through: content follows your finger.
  const onDown = (ev: React.PointerEvent) => {
    drag.current = { x: ev.clientX, startX: ev.clientX, active: true };
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    if (open) book.dragging = true;
  };
  const onMove = (ev: React.PointerEvent) => {
    if (!drag.current.active || !open) return;
    const dx = ev.clientX - drag.current.x;
    drag.current.x = ev.clientX;
    book.f += dx / 170;
  };
  const onUp = (ev: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const moved = Math.abs(ev.clientX - drag.current.startX);
    if (!open) {
      if (moved < 6) setBookOpen(true);
      return;
    }
    book.dragging = false;
    book.target = Math.round(book.f);
    setRoom(logicalOf(book.target));
  };

  const current = ROOMS[room];

  return (
    <main className="stage">
      <header className="topbar">
        <div className="wordmark">
          unfold
          <HandUnderline />
        </div>
        <button className={`hand-btn rsvp-btn ${writing ? "is-hidden" : ""}`} onClick={() => setRsvp("")}>
          send greeting
        </button>
      </header>

      <div className="canvas-wrap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => setBookOpen(!open)}>
        {tex && (
          <Canvas orthographic flat linear dpr={[1, 2]} camera={{ position: [0, 2, 10], zoom: 200, near: 0.1, far: 100 }} gl={{ alpha: true, antialias: true }}>
            <Book
              tex={tex}
              onSpot={(li) => {
                // move in on the invite card, then hold it up close
                book.zoomTarget = 1;
                setTimeout(() => setCard(ROOMS[li].name), 380);
              }}
            />
            <ContactShadows position={[0, -0.04, 0]} scale={5} resolution={512} far={1.4} blur={2.4} opacity={0.32} color="#2a2350" frames={Infinity} />
          </Canvas>
        )}
        {!tex && (
          <div className="loading" role="status" aria-live="polite" aria-atomic="true">
            <svg className="loading-flower" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M24 24C17 21 18 11 24 6c6 5 7 15 0 18Z" />
              <path d="M24 24c3-7 13-6 18 0-5 6-15 7-18 0Z" />
              <path d="M24 24c7 3 6 13 0 18-6-5-7-15 0-18Z" />
              <path d="M24 24c-3 7-13 6-18 0 5-6 15-7 18 0Z" />
              <circle cx="24" cy="24" r="3" />
            </svg>
            <span>folding a little celebration for you…</span>
          </div>
        )}
        {settingsError && <p className="invite-settings-error" role="status">{settingsError} You can review these details at /admin.</p>}
      </div>

      <button
        className={`arrow arrow-left ${open ? "" : "is-off"} ${writing ? "is-hidden" : ""}`}
        aria-label="Previous room"
        onClick={() => step(-1)}
        disabled={!open}
      >
        <HandArrow flip />
      </button>
      <button
        className={`arrow arrow-right ${writing ? "is-hidden" : ""}`}
        aria-label={open ? "Next room" : "Open the book"}
        onClick={() => (open ? step(1) : setBookOpen(true))}
      >
        <HandArrow />
      </button>

      <footer className="caption">
        {open ? (
          <>
            <div className="room-name">{eventByKey(current.name)?.name ?? current.name}</div>
            <div className="room-mood">{eventByKey(current.name) ? `${fmtDay(eventByKey(current.name)!.start)} · tap the card` : ""}</div>
          </>
        ) : (
          <div className="room-mood">you&apos;re invited · tap the cover to open</div>
        )}
      </footer>
      {card && eventByKey(card) && (
        <EventCard
          ev={eventByKey(card)!}
          onClose={() => {
            setCard(null);
            book.zoomTarget = 0;
          }}
          onRsvp={() => {
            setRsvp(card);
            setCard(null);
            book.zoomTarget = 0;
          }}
        />
      )}
      {rsvp !== null && <Rsvp preselect={rsvp || undefined} onClose={() => setRsvp(null)} />}
    </main>
  );
}
