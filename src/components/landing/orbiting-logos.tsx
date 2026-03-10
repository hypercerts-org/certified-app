"use client";

import React, { useEffect, useRef } from "react";

interface OrbitingLogosProps {
  logos: string[];
  className?: string;
}

interface OrbitState {
  radiusX: number;
  radiusY: number;
  speed: number;
  angle: number;
  centerX: number;
  centerY: number;
  isDragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  currentX: number;
  currentY: number;
}

export default function OrbitingLogos({ logos, className }: OrbitingLogosProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const orbitsRef = useRef<OrbitState[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const reducedMotionRef = useRef<boolean>(false);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  if (logos.length === 0) return null;

  return (
    <OrbitingLogosInner
      logos={logos}
      className={className}
      containerRef={containerRef}
      logoRefs={logoRefs}
      orbitsRef={orbitsRef}
      rafRef={rafRef}
      lastTimeRef={lastTimeRef}
      reducedMotionRef={reducedMotionRef}
      containerSizeRef={containerSizeRef}
    />
  );
}

interface InnerProps {
  logos: string[];
  className?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  logoRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  orbitsRef: React.MutableRefObject<OrbitState[]>;
  rafRef: React.MutableRefObject<number | null>;
  lastTimeRef: React.MutableRefObject<number | null>;
  reducedMotionRef: React.MutableRefObject<boolean>;
  containerSizeRef: React.MutableRefObject<{ width: number; height: number }>;
}

function OrbitingLogosInner({
  logos,
  className,
  containerRef,
  logoRefs,
  orbitsRef,
  rafRef,
  lastTimeRef,
  reducedMotionRef,
  containerSizeRef,
}: InnerProps) {
  useEffect(() => {
    // Check reduced motion preference
    reducedMotionRef.current =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const container = containerRef.current;
    if (!container) return;

    const count = logos.length;

    function initOrbits(width: number, height: number) {
      const isMobile = width < 600;
      const scale = isMobile ? 0.6 : 1.0;
      const logoSize = isMobile ? 44 : 56;

      containerSizeRef.current = { width, height };

      const centerX = width / 2;
      const centerY = height / 2;

      // Define 2-3 concentric orbits
      const orbitTiers = [
        { radiusX: 280 * scale, radiusY: 280 * scale * 0.65 },
        { radiusX: 350 * scale, radiusY: 350 * scale * 0.65 },
        { radiusX: 420 * scale, radiusY: 420 * scale * 0.65 },
      ];

      // Speed range: 0.15 to 0.4 rad/s, alternating direction
      const speeds = [0.22, -0.18, 0.35, -0.28, 0.15, -0.4, 0.3, -0.25, 0.2, -0.32];

      orbitsRef.current = logos.map((_, i) => {
        const tier = orbitTiers[i % orbitTiers.length];
        const baseAngle = (2 * Math.PI / count) * i;
        // Small jitter per logo
        const jitter = (i * 0.37) % (Math.PI / 4);
        const angle = baseAngle + jitter;
        const speed = speeds[i % speeds.length];

        const x = centerX + tier.radiusX * Math.cos(angle);
        const y = centerY + tier.radiusY * Math.sin(angle);

        return {
          radiusX: tier.radiusX,
          radiusY: tier.radiusY,
          speed,
          angle,
          centerX,
          centerY,
          isDragging: false,
          dragOffsetX: 0,
          dragOffsetY: 0,
          currentX: x,
          currentY: y,
        };
      });

      // Apply initial positions and sizes
      logoRefs.current.forEach((el, i) => {
        if (!el) return;
        const orbit = orbitsRef.current[i];
        el.style.width = `${logoSize}px`;
        el.style.height = `${logoSize}px`;
        el.style.transform = `translate(calc(${orbit.currentX}px - 50%), calc(${orbit.currentY}px - 50%))`;
      });
    }

    // ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        initOrbits(width, height);
      }
    });
    resizeObserver.observe(container);

    // Initial sizing
    const rect = container.getBoundingClientRect();
    initOrbits(rect.width || window.innerWidth, rect.height || window.innerHeight);

    // Animation loop
    function animate(timestamp: number) {
      if (reducedMotionRef.current) {
        // No animation, just keep positions
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const deltaTime = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1); // cap at 100ms
      lastTimeRef.current = timestamp;

      logoRefs.current.forEach((el, i) => {
        if (!el) return;
        const orbit = orbitsRef.current[i];
        if (!orbit) return;

        if (!orbit.isDragging) {
          orbit.angle += orbit.speed * deltaTime;
          orbit.currentX = orbit.centerX + orbit.radiusX * Math.cos(orbit.angle);
          orbit.currentY = orbit.centerY + orbit.radiusY * Math.sin(orbit.angle);
          el.style.transform = `translate(calc(${orbit.currentX}px - 50%), calc(${orbit.currentY}px - 50%))`;
        }
      });

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    // Drag handlers
    const pointerDownHandlers: ((e: PointerEvent) => void)[] = [];
    const pointerMoveHandlers: ((e: PointerEvent) => void)[] = [];
    const pointerUpHandlers: ((e: PointerEvent) => void)[] = [];

    logoRefs.current.forEach((el, i) => {
      if (!el) return;

      const onPointerDown = (e: PointerEvent) => {
        e.preventDefault();
        const orbit = orbitsRef.current[i];
        if (!orbit) return;

        el.setPointerCapture(e.pointerId);
        orbit.isDragging = true;

        const containerRect = container.getBoundingClientRect();
        const logoX = orbit.currentX;
        const logoY = orbit.currentY;
        const pointerX = e.clientX - containerRect.left;
        const pointerY = e.clientY - containerRect.top;

        orbit.dragOffsetX = logoX - pointerX;
        orbit.dragOffsetY = logoY - pointerY;

        el.style.filter = "grayscale(0%) brightness(1)";
        el.style.opacity = "1";
        el.style.cursor = "grabbing";
        el.style.boxShadow = "0 0 24px rgba(85,85,85,0.4)";
        el.style.zIndex = "10";
      };

      const onPointerMove = (e: PointerEvent) => {
        const orbit = orbitsRef.current[i];
        if (!orbit || !orbit.isDragging) return;

        const containerRect = container.getBoundingClientRect();
        const pointerX = e.clientX - containerRect.left;
        const pointerY = e.clientY - containerRect.top;

        orbit.currentX = pointerX + orbit.dragOffsetX;
        orbit.currentY = pointerY + orbit.dragOffsetY;

        el!.style.transform = `translate(calc(${orbit.currentX}px - 50%), calc(${orbit.currentY}px - 50%))`;
      };

      const onPointerUp = (e: PointerEvent) => {
        const orbit = orbitsRef.current[i];
        if (!orbit || !orbit.isDragging) return;

        el!.releasePointerCapture(e.pointerId);
        orbit.isDragging = false;

        // Calculate new angle from release position relative to center
        const dx = orbit.currentX - orbit.centerX;
        const dy = orbit.currentY - orbit.centerY;
        orbit.angle = Math.atan2(dy, dx);

        // Recalculate radii based on drop distance, clamped to a minimum
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isMobile = containerSizeRef.current.width < 600;
        const minRadius = isMobile ? 160 : 250;
        const clampedDist = Math.max(dist, minRadius);
        const aspectRatio = orbit.radiusY / orbit.radiusX;
        orbit.radiusX = clampedDist;
        orbit.radiusY = clampedDist * aspectRatio;

        el!.style.filter = "grayscale(100%) brightness(0.7)";
        el!.style.opacity = "0.6";
        el!.style.cursor = "grab";
        el!.style.boxShadow = "none";
        el!.style.zIndex = "auto";
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);

      pointerDownHandlers[i] = onPointerDown;
      pointerMoveHandlers[i] = onPointerMove;
      pointerUpHandlers[i] = onPointerUp;
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resizeObserver.disconnect();
      lastTimeRef.current = null;

      logoRefs.current.forEach((el, i) => {
        if (!el) return;
        if (pointerDownHandlers[i]) el.removeEventListener("pointerdown", pointerDownHandlers[i]);
        if (pointerMoveHandlers[i]) el.removeEventListener("pointermove", pointerMoveHandlers[i]);
        if (pointerUpHandlers[i]) el.removeEventListener("pointerup", pointerUpHandlers[i]);
      });
    };
  }, [logos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {logos.map((src, i) => (
        <div
          key={src + i}
          ref={(el) => {
            logoRefs.current[i] = el;
          }}
          style={{
            position: "absolute",
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            overflow: "hidden",
            cursor: "grab",
            filter: "grayscale(100%) brightness(0.7)",
            opacity: 0.6,
            transition: "filter 0.3s ease, opacity 0.3s ease, box-shadow 0.3s ease",
            userSelect: "none",
            willChange: "transform",
            pointerEvents: "auto",
            top: 0,
            left: 0,
          } as React.CSSProperties}
        >
          <img
            src={src}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
              userSelect: "none",
            }}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
