// Delivered by Originkit · stack: nextjs · styling: tailwind
/* eslint-disable */
// @ts-nocheck
"use client"
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import XylophoneHelix from "@/components/originkit/ui/contact-01/xylophone-helix";

export function SectionContact() {
  const [mounts, setMounts] = useState([]);
  useEffect(() => runPageScript({ XylophoneHelix }, setMounts), []);
  return (
    <div className="contact-01">
    <>
      <section className="contact">
        <div className="top">
          <h2>
            Book
            <br />
            the room
          </h2>
          <p className="addr">
            <b>Ringwood Studios</b>
            <br />
            14 Ringwood Lane, Bristol BS2 0HQ
            <br />
            book@ringwood.studio · 0117 946 0021
          </p>
        </div>
        <div className="body">
          <div>
            <div className="portal">
              <div
                id="chimes"
                aria-label="The bar chimes in Live Room A; they ring as the pointer crosses them"
              />
            </div>
            <p className="cap">The chimes in Live Room A. Run your pointer across them.</p>
          </div>
          <form id="book">
            <p className="intro">
              Tell us what you're making and when. An engineer writes back within a working day with
              dates and a quote.
            </p>
            <fieldset>
              <legend>Which room?</legend>
              <div className="rooms">
                <label>
                  <input type="radio" name="room" value="a" defaultChecked />
                  <b>Live Room A</b>
                  <span>64 m², up to 8 players</span>
                  <em>£420 / day</em>
                </label>
                <label>
                  <input type="radio" name="room" value="b" />
                  <b>Vocal Booth B</b>
                  <span>Iso booth with control</span>
                  <em>£260 / day</em>
                </label>
                <label>
                  <input type="radio" name="room" value="c" />
                  <b>Mix Suite C</b>
                  <span>Atmos 7.1.4</span>
                  <em>£380 / day</em>
                </label>
              </div>
            </fieldset>
            <div className="fields">
              <div className="f">
                <label htmlFor="n">Name</label>
                <input id="n" name="name" required autoComplete="name" placeholder="Ada Morgan" />
              </div>
              <div className="f">
                <label htmlFor="e">Email</label>
                <input
                  id="e"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ada@band.co"
                />
              </div>
              <div className="f full">
                <label htmlFor="m">The project</label>
                <textarea
                  id="m"
                  name="message"
                  placeholder="Five-piece, recording an EP live to tape. Two days tracking, one mixing, sometime in March."
                />
              </div>
            </div>
            <div className="send">
              <button type="submit">Request dates</button>
              <span id="sent">Engineer included in every day rate.</span>
            </div>
          </form>
        </div>
      </section>
      {mounts.map((m) => createPortal(m.element, m.el, m.id))}
    </>
    </div>
  );
}

// The section's own script, kept exactly as written so its behaviour (clicks, timers, mode
// switches) stays identical. Its OKReact.mount / ReactDOM.createRoot calls go through the
// adapter below: each "root" is an entry in the section's state, rendered as a portal into its
// element, so everything stays in the host's one React tree (no second react-dom needed).
function runPageScript({ XylophoneHelix }, setMounts) {
  let next = 0;
  const timers = [];
  const createRoot = (el) => {
    const id = "m" + next++;
    return {
      render: (element) =>
        setMounts((ms) =>
          ms.some((m) => m.id === id)
            ? ms.map((m) => (m.id === id ? { id, el, element } : m))
            : [...ms, { id, el, element }],
        ),
      unmount: () => setMounts((ms) => ms.filter((m) => m.id !== id)),
    };
  };
  const ReactDOM = { createRoot };
  const OKReact = {
    mount(Comp, el, props) {
      const root = createRoot(el);
      root.render(React.createElement(Comp, props));
      return { el, update: (next) => root.render(React.createElement(Comp, next)) };
    },
  };
  const setInterval = (...a) => (timers.push(window.setInterval(...a)), timers.at(-1));
  const setTimeout = (...a) => (timers.push(window.setTimeout(...a)), timers.at(-1));
  // The real IntersectionObserver, plus a fallback that measures the element itself: a host that
  // attaches the section before its frame renders (OriginKit's preview, hidden tabs, modals) can
  // leave the browser's first notification undelivered, and a scroll-in effect would never start.
  class IntersectionObserver {
    constructor(cb, opts = {}) {
      this.cb = cb;
      this.targets = new Set();
      this.seen = new Map();
      this.off = false;
      const th = [].concat(opts.threshold ?? 0)[0];
      this.real = new window.IntersectionObserver((entries) => {
        for (const e of entries) this.seen.set(e.target, e.isIntersecting);
        if (!this.off) cb(entries, this);
      }, opts);
      this.check = () => {
        for (const t of this.targets) {
          if (this.off || this.seen.get(t)) continue;
          const r = t.getBoundingClientRect(),
            vw = window.innerWidth,
            vh = window.innerHeight;
          const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)),
            h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
          const ratio = r.width && r.height ? (w * h) / (r.width * r.height) : 0;
          if (ratio > 0 && ratio >= th) {
            this.seen.set(t, true);
            cb(
              [
                {
                  target: t,
                  isIntersecting: true,
                  intersectionRatio: ratio,
                  boundingClientRect: r,
                },
              ],
              this,
            );
          }
        }
      };
      window.addEventListener("scroll", this.check, true);
      window.addEventListener("resize", this.check);
    }
    observe(t) {
      this.targets.add(t);
      this.real.observe(t);
      timers.push(window.setTimeout(this.check, 300), window.setTimeout(this.check, 1200));
    }
    unobserve(t) {
      this.targets.delete(t);
      this.real.unobserve(t);
    }
    disconnect() {
      this.off = true;
      this.targets.clear();
      this.real.disconnect();
      window.removeEventListener("scroll", this.check, true);
      window.removeEventListener("resize", this.check);
    }
  }

  // The live room's chimes: polished bars hung as a sphere in the portal's dark wine. Each bar the
  // pointer crosses rings and swings, its wake washing coral and cream stage light over the metal.
  ReactDOM.createRoot(document.getElementById("chimes")).render(
    React.createElement(XylophoneHelix, {
      background: "#2E0715",
      baseColor: "#D9C7B8",
      bars: 44,
      shape: "sphere",
      speed: 70,
      drag: 100,
      scale: 74,
      metal: { reflect: 85, polish: 100 },
      hover: {
        colors: ["#4A0F22", "#FF5A3C", "#F7E6D8", "#FFB08A"],
        strength: 100,
        tint: 90,
        glow: 40,
      },
      camera: { tilt: 47, sideTilt: 0 },
      style: { width: "100%", height: "100%" },
    }),
  );
  // Draft-only: confirm in place instead of sending anywhere.
  document.getElementById("book").addEventListener("submit", (e) => {
    e.preventDefault();
    document.getElementById("sent").textContent =
      "Thanks. An engineer will reply within a working day.";
  });

  return () => {
    timers.forEach((id) => {
      window.clearInterval(id);
      window.clearTimeout(id);
    });
    setMounts([]);
  };
}
