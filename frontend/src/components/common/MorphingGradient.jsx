import { useEffect, useRef } from 'react'

// Morphing pastel-gradient background used behind the Hero.
//
// Four large blurred orbs — one per brand colour — drift slowly in opposite
// directions so the composition never repeats. A fifth, softer orb tracks
// the cursor with a touch of lag so the surface feels alive.
//
// The cursor-follower updates the DOM transform directly via ref + rAF
// instead of via React state, so we don't trigger a re-render every frame.
//
// Render this inside any `relative` parent — it absolutely-positions itself
// and is pointer-events-none, so it never intercepts clicks on the content.
export default function MorphingGradient() {
  const containerRef = useRef(null)
  const followerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const follower = followerRef.current
    if (!container || !follower) return

    // Respect users who prefer reduced motion: park the follower in the
    // centre and skip the animation loop entirely.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      follower.style.transform = 'translate3d(50%, 50%, 0) translate(-50%, -50%)'
      return
    }

    // Target = where the cursor currently is. pos = where the blob is right
    // now (chases target with linear interpolation each frame).
    const target = { x: 0, y: 0 }
    const pos = { x: 0, y: 0 }
    let rafId = 0
    let initialised = false

    const onMove = (e) => {
      const rect = container.getBoundingClientRect()
      // Clamp to container bounds so the follower can't fly off-screen when
      // the cursor leaves the hero section.
      target.x = Math.max(0, Math.min(rect.width,  e.clientX - rect.left))
      target.y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
      if (!initialised) {
        // First mouse event - jump to that position instead of springing in.
        pos.x = target.x
        pos.y = target.y
        initialised = true
      }
    }

    const tick = () => {
      // Lerp: pos moves 7% of the way to target each frame -> ~250ms settle.
      pos.x += (target.x - pos.x) * 0.07
      pos.y += (target.y - pos.y) * 0.07
      follower.style.transform =
        `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove)
    rafId = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-white"
    >
      {/* Four pastel orbs - one per brand palette - each with a distinct
          size and orbit path. The four corners of the hero are seeded so
          that at any frame at least two orbs are crossing the centre, which
          keeps the background lively even at the bottom of the section.
          Heavy blur lets the colours bleed together at the seams instead of
          reading as discrete shapes. */}
      <div className="absolute -top-20 -left-20 h-[600px] w-[600px] rounded-pill bg-primary-200/35 blur-3xl animate-morph-a" />
      <div
        className="absolute top-[15%] right-[20%] h-[240px] w-[240px] rounded-pill bg-coral-200/35 blur-3xl animate-morph-b"
        style={{ animationDelay: '-5s' }}
      />
      <div
        className="absolute bottom-[5%] -left-16 h-[420px] w-[420px] rounded-pill bg-mint-200/30 blur-3xl animate-morph-c"
        style={{ animationDelay: '-10s' }}
      />
      <div
        className="absolute -bottom-20 -right-16 h-[340px] w-[340px] rounded-pill bg-sky-200/35 blur-3xl animate-morph-d"
        style={{ animationDelay: '-15s' }}
      />

      {/* Cursor follower - a soft warm highlight that brightens whichever
          coloured orb is currently underneath the pointer. Anchored at
          (0,0); the rAF loop translates it to the cursor position. */}
      <div
        ref={followerRef}
        className="absolute left-0 top-0 h-[420px] w-[420px] rounded-pill blur-3xl will-change-transform"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 244, 236, 0.35) 0%, rgba(255, 221, 223, 0.18) 45%, rgba(255, 221, 223, 0) 70%)',
        }}
      />
    </div>
  )
}
