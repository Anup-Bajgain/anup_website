(function () {
  // ===== SHARED HELPERS =====
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const isFinePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  function hexToRgb(hex) {
    const clean = hex.replace("#", "").trim();
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean;
    const num = parseInt(full, 16) || 0x4dabf7;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function currentHoverFillColor() {
    // White reads fine on the dark theme's near-black background, but
    // disappears on the light theme's near-white one - so on light theme,
    // use its own text-ink color instead of hardcoded white.
    const isLightTheme = document.body.classList.contains("light-theme");
    if (!isLightTheme) return "#ffffff";
    return (
      getComputedStyle(document.body)
        .getPropertyValue("--text-primary")
        .trim() || "#1a1e2b"
    );
  }

  let accentRGB = hexToRgb(
    getComputedStyle(document.body).getPropertyValue("--accent").trim() ||
      "#4dabf7",
  );
  let hoverFillColor = currentHoverFillColor();
  function refreshAccentColor() {
    accentRGB = hexToRgb(
      getComputedStyle(document.body).getPropertyValue("--accent").trim() ||
        "#4dabf7",
    );
    hoverFillColor = currentHoverFillColor();
  }
  function accentRGBA(alpha) {
    return `rgba(${accentRGB.r}, ${accentRGB.g}, ${accentRGB.b}, ${alpha})`;
  }

  // ===== PRELOADER =====
  window.addEventListener("load", () => {
    document.getElementById("preloader").classList.add("hidden");
    setTimeout(() => {
      const preloader = document.getElementById("preloader");
      if (preloader) preloader.remove();
    }, 600);
    initHeroIntro();
  });

  // ===== AERO CURSOR (paper-plane + contrail, fine-pointer devices only) =====
  function initAeroCursor() {
    const canvas = document.getElementById("cursorCanvas");
    if (!canvas) return;
    if (!isFinePointer) {
      canvas.remove();
      return;
    }

    // ---- Cursor size ----
    // Change this one number to resize the whole cursor (plane + contrail + hover ring).
    // 1 = original small size, 1.4 = current, 2 = double, etc.
    const CURSOR_SCALE = 1.4;

    const ctx = canvas.getContext("2d");
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const plane = { x: pointer.x, y: pointer.y, angle: -45, hoverScale: 1 };
    let trail = [];
    let hovering = false;
    let overField = false;
    let visible = false;

    document.addEventListener("mousemove", (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      visible = true;
    });
    document.addEventListener("mouseleave", () => {
      visible = false;
    });

    const hoverSelector =
      "a, button, .btn, .skill-card, .project-card, .cert-card, .theme-toggle, .hamburger, .scroll-top-btn";
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest && e.target.closest(hoverSelector)) hovering = true;
      if (e.target.closest && e.target.closest("input, textarea"))
        overField = true;
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest && e.target.closest(hoverSelector))
        hovering = false;
      if (e.target.closest && e.target.closest("input, textarea"))
        overField = false;
    });

    function frame() {
      requestAnimationFrame(frame);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      document.body.classList.toggle("cursor-native", overField);
      if (!visible || overField) return;

      const dx = pointer.x - plane.x;
      const dy = pointer.y - plane.y;
      const posEase = prefersReducedMotion ? 1 : 0.55;
      plane.x += dx * posEase;
      plane.y += dy * posEase;

      if (Math.hypot(dx, dy) > 1.2) {
        const targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
        let diff = ((targetAngle - plane.angle + 540) % 360) - 180;
        plane.angle += diff * (prefersReducedMotion ? 1 : 0.18);
      }

      const targetHoverScale = hovering ? 1.25 : 1;
      plane.hoverScale +=
        (targetHoverScale - plane.hoverScale) * (prefersReducedMotion ? 1 : 0.2);

      if (!prefersReducedMotion) {
        trail.push({ x: plane.x, y: plane.y, life: 1 });
        if (trail.length > 14) trail.shift();
      }
      trail.forEach((p) => (p.life -= 0.07));
      trail = trail.filter((p) => p.life > 0);
      trail.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1.8 * p.life + 0.3) * CURSOR_SCALE, 0, Math.PI * 2);
        ctx.fillStyle = accentRGBA(p.life * 0.4);
        ctx.fill();
      });

      ctx.save();
      ctx.translate(plane.x, plane.y);
      ctx.rotate((plane.angle * Math.PI) / 180);
      ctx.scale(
        CURSOR_SCALE * plane.hoverScale,
        CURSOR_SCALE * plane.hoverScale,
      );

      // Symmetric top-down dart with a tail spike, single flat fill.
      // No shading panels, no isometric tilt - reverted per feedback.
      // Hover state: color change + slight size bump, no reticle overlay.
      ctx.beginPath();
      ctx.moveTo(10, 0); // nose
      ctx.lineTo(-4, 5.5); // right wingtip
      ctx.lineTo(-5.5, 1.5); // right notch, cutting in toward the tail
      ctx.lineTo(-9, 0); // tail spike
      ctx.lineTo(-5.5, -1.5); // left notch
      ctx.lineTo(-4, -5.5); // left wingtip
      ctx.closePath();
      ctx.fillStyle = hovering ? hoverFillColor : accentRGBA(0.95);
      ctx.fill();

      // center fold crease, nose to tail
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-8, 0);
      ctx.strokeStyle = "rgba(10, 14, 23, 0.25)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.restore();
    }
    frame();
  }
  initAeroCursor();

  // ===== THEME TOGGLE =====
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;
  themeToggle.addEventListener("click", () => {
    body.classList.toggle("light-theme");
    body.classList.toggle("dark-theme");
    refreshAccentColor();
  });

  // ===== MOBILE NAV =====
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("navLinks");
  hamburger.addEventListener("click", () => {
    navLinks.classList.toggle("active");
  });
  // Close mobile nav on link click
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
    });
  });

  // ===== ACTIVE NAV LINK ON SCROLL =====
  const sections = document.querySelectorAll("section[id]");
  window.addEventListener("scroll", () => {
    let scrollY = window.pageYOffset;
    sections.forEach((current) => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 100;
      const sectionId = current.getAttribute("id");
      const navLink = document.querySelector(
        `.nav-link[data-section="${sectionId}"]`,
      );
      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        document
          .querySelectorAll(".nav-link")
          .forEach((link) => link.classList.remove("active"));
        if (navLink) navLink.classList.add("active");
      }
    });
  });

  // ===== SCROLL REVEAL (GSAP ScrollTrigger batching, with IO fallback) =====
  function initRevealAnimations() {
    const revealElements = document.querySelectorAll(".reveal");
    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.batch(revealElements, {
        start: "top 88%",
        once: true,
        onEnter: (batch) => {
          batch.forEach((el, i) => {
            setTimeout(
              () => el.classList.add("visible"),
              prefersReducedMotion ? 0 : i * 90,
            );
          });
        },
      });
    } else {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 },
      );
      revealElements.forEach((el) => revealObserver.observe(el));
    }
  }
  initRevealAnimations();

  // Keep the role line stable so visitors can read it immediately.
  const typewriterElement = document.getElementById("typewriterDynamic");
  if (typewriterElement) typewriterElement.textContent = "CFD & Experimental Fluid Dynamics";

  // ===== STAT COUNTER ANIMATION (CountUp.js, with homemade fallback) =====
  const statNumbers = document.querySelectorAll(".stat-number[data-count]");
  const statObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.getAttribute("data-count"), 10);
          const CountUpCtor =
            window.CountUp || (window.countUp && window.countUp.CountUp);
          if (CountUpCtor) {
            const counter = new CountUpCtor(el, target, {
              duration: prefersReducedMotion ? 0.3 : 2,
            });
            if (!counter.error) {
              counter.start();
            } else {
              el.textContent = target;
            }
          } else {
            let count = 0;
            const increment = Math.ceil(target / 30);
            const updateCounter = () => {
              count += increment;
              if (count >= target) {
                el.textContent = target;
                return;
              }
              el.textContent = count;
              setTimeout(updateCounter, 40);
            };
            updateCounter();
          }
          statObserver.unobserve(el);
        }
      });
    },
    { threshold: 0.5 },
  );
  statNumbers.forEach((el) => statObserver.observe(el));

  // ===== 3D TILT ON CARDS (Vanilla-Tilt, with CSS fallback class) =====
  const tiltTargets = document.querySelectorAll(
    ".skill-card, .project-card, .cert-card",
  );
  if (window.VanillaTilt) {
    VanillaTilt.init(tiltTargets, {
      max: 7,
      speed: 400,
      glare: true,
      "max-glare": 0.12,
      scale: 1.02,
      gyroscope: false,
    });
  } else {
    tiltTargets.forEach((el) => el.classList.add("tilt-fallback"));
  }

  // ===== TIMELINE RADAR PING STAGGER =====
  document.querySelectorAll(".timeline-dot").forEach((dot, i) => {
    dot.style.setProperty("--ping-delay", `${i * 0.4}s`);
  });

  // ===== SCROLL TO TOP BUTTON =====
  const scrollTopBtn = document.getElementById("scrollTopBtn");
  window.addEventListener("scroll", () => {
    if (window.pageYOffset > 500) {
      scrollTopBtn.classList.add("visible");
    } else {
      scrollTopBtn.classList.remove("visible");
    }
  });
  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ===== HERO INTRO (GSAP) =====
  function initHeroIntro() {
    if (!window.gsap || prefersReducedMotion) return;
    const tl = gsap.timeline({
      defaults: { ease: "power3.out", duration: 0.7 },
    });
    tl.from(".hero-greeting", { opacity: 0, y: 20 }, 0.15)
      .from(".hero-name", { opacity: 0, y: 24 }, 0.3)
      .from(".hero-typewriter", { opacity: 0, y: 16 }, 0.5)
      .from(".hero-description", { opacity: 0, y: 16 }, 0.65)
      .from(".hero-cta", { opacity: 0, y: 16 }, 0.8);
  }


})();
