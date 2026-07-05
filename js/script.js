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

  let accentRGB = hexToRgb(
    getComputedStyle(document.body).getPropertyValue("--accent").trim() ||
      "#4dabf7",
  );
  function refreshAccentColor() {
    accentRGB = hexToRgb(
      getComputedStyle(document.body).getPropertyValue("--accent").trim() ||
        "#4dabf7",
    );
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
    const plane = { x: pointer.x, y: pointer.y, angle: -45 };
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
      ctx.scale(CURSOR_SCALE, CURSOR_SCALE);

      // Symmetric top-down dart with a tail spike, single flat fill.
      // No shading panels, no isometric tilt - reverted per feedback.
      // Hover state is color-only now (no reticle overlay).
      ctx.beginPath();
      ctx.moveTo(10, 0); // nose
      ctx.lineTo(-4, 5.5); // right wingtip
      ctx.lineTo(-5.5, 1.5); // right notch, cutting in toward the tail
      ctx.lineTo(-9, 0); // tail spike
      ctx.lineTo(-5.5, -1.5); // left notch
      ctx.lineTo(-4, -5.5); // left wingtip
      ctx.closePath();
      ctx.fillStyle = hovering ? "#ffffff" : accentRGBA(0.95);
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

  // ===== SKILL BARS ANIMATION =====
  const skillBars = document.querySelectorAll(".skill-progress");
  const skillObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          bar.style.width = bar.style.getPropertyValue("--progress");
          skillObserver.unobserve(bar);
        }
      });
    },
    { threshold: 0.3 },
  );
  skillBars.forEach((bar) => skillObserver.observe(bar));

  // ===== TYPEWRITER EFFECT (Typed.js, with homemade fallback) =====
  const words = [
    "CFD Enthusiast",
    "Computational Engineer",
    "Fluid Dynamics Specialist",
    "UAV Designer",
  ];
  if (window.Typed) {
    new Typed("#typewriterDynamic", {
      strings: words,
      typeSpeed: 55,
      backSpeed: 28,
      backDelay: 1500,
      startDelay: 200,
      loop: true,
      showCursor: false,
    });
  } else {
    const typewriterElement = document.getElementById("typewriterDynamic");
    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    function type() {
      const currentWord = words[wordIndex];
      if (!isDeleting) {
        typewriterElement.textContent = currentWord.substring(
          0,
          charIndex + 1,
        );
        charIndex++;
        if (charIndex === currentWord.length) {
          setTimeout(() => {
            isDeleting = true;
            type();
          }, 1500);
          return;
        }
        setTimeout(type, 100);
      } else {
        typewriterElement.textContent = currentWord.substring(
          0,
          charIndex - 1,
        );
        charIndex--;
        if (charIndex === 0) {
          isDeleting = false;
          wordIndex = (wordIndex + 1) % words.length;
          setTimeout(type, 400);
          return;
        }
        setTimeout(type, 50);
      }
    }
    type();
  }

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

  // ===== PROJECT MODAL =====
  const modal = document.getElementById("projectModal");
  const modalClose = document.getElementById("modalClose");
  const modalTitle = document.getElementById("modalTitle");
  const modalTags = document.getElementById("modalTags");
  const modalDesc = document.getElementById("modalDescription");
  const modalDetails = document.getElementById("modalDetails");

  const projectData = {
    1: {
      title: "UAV Design Optimization",
      tags: ["OpenFOAM", "Python", "CAD"],
      desc: "Full aerodynamic optimization of a fixed-wing UAV using parametric sweeps and surrogate modeling.",
      details:
        "Used OpenFOAM for RANS simulations, Python for automation, and CAD for geometry morphing. Achieved 12% improvement in L/D ratio.",
    },
    2: {
      title: "CFD Analysis of Supersonic Flow",
      tags: ["ANSYS Fluent", "MATLAB"],
      desc: "Numerical simulation of supersonic flow over a diamond airfoil.",
      details:
        "Captured shock waves and expansion fans. Validated against experimental schlieren data.",
    },
    3: {
      title: "Natural Convection Simulation",
      tags: ["OpenFOAM", "Python"],
      desc: "CFD simulation of natural convection in a differentially heated cavity.",
      details:
        "Analyzed Rayleigh number effects from 10^3 to 10^6. Developed automated post-processing pipeline.",
    },
    4: {
      title: "Rocket Nozzle Flow Visualization",
      tags: ["ANSYS Fluent", "MATLAB"],
      desc: "Simulation of compressible flow through a converging-diverging nozzle.",
      details:
        "Visualized Mach disk formation and analyzed thrust coefficient variations.",
    },
    5: {
      title: "ESP32 Wireless Micropad",
      tags: ["ESP32", "C++", "IoT"],
      desc: "Wireless sensor micropad for wind tunnel data acquisition.",
      details:
        "Real-time telemetry of pressure and temperature. Used in undergraduate wind tunnel lab.",
    },
    6: {
      title: "Schlieren Flow Visualization",
      tags: ["Optics", "MATLAB"],
      desc: "Design and construction of a Schlieren imaging setup.",
      details:
        "Visualized compressible flow over a cylinder. Image processing in MATLAB for density gradient quantification.",
    },
  };

  document.querySelectorAll(".btn-project-detail").forEach((btn) => {
    btn.addEventListener("click", () => {
      const projectId = btn.getAttribute("data-project");
      const data = projectData[projectId];
      modalTitle.textContent = data.title;
      modalTags.innerHTML = data.tags
        .map((tag) => `<span class="project-tag">${tag}</span>`)
        .join("");
      modalDesc.textContent = data.desc;
      modalDetails.textContent = data.details;
      modal.classList.add("active");
    });
  });

  modalClose.addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  // ===== CONTACT FORM (prevent default) =====
  document.getElementById("contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Thanks for your message! (Demo form - no backend)");
    e.target.reset();
  });

  // ===== HERO CANVAS PARTICLES (theme-aware, gentle CFD-style curl) =====
  const canvas = document.getElementById("heroCanvas");
  const ctx = canvas.getContext("2d");
  let particles = [];
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 1.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.4;
      this.speedY = (Math.random() - 0.5) * 0.4;
      this.opacity = Math.random() * 0.5 + 0.1;
    }
    update() {
      const curl = Math.sin((this.x + this.y) * 0.01) * 0.02;
      this.speedX += curl;
      this.speedY -= curl;
      this.speedX = Math.max(-0.6, Math.min(0.6, this.speedX));
      this.speedY = Math.max(-0.6, Math.min(0.6, this.speedY));
      this.x += this.speedX;
      this.y += this.speedY;
      if (
        this.x < 0 ||
        this.x > canvas.width ||
        this.y < 0 ||
        this.y > canvas.height
      ) {
        this.reset();
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = accentRGBA(this.opacity);
      ctx.fill();
    }
  }

  function initParticles(count = 80) {
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }
  }
  initParticles();

  function connectParticles() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = accentRGBA(0.06 * (1 - dist / 100));
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.update();
      p.draw();
    });
    connectParticles();
    requestAnimationFrame(animateParticles);
  }
  animateParticles();

  // ===== HERO INTRO + PARALLAX (GSAP) =====
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

  function initHeroParallax() {
    const orbit = document.getElementById("heroOrbit");
    const heroSection = document.getElementById("home");
    if (
      !orbit ||
      !heroSection ||
      !window.gsap ||
      !isFinePointer ||
      prefersReducedMotion
    )
      return;
    const xTo = gsap.quickTo(orbit, "x", { duration: 0.6, ease: "power3" });
    const yTo = gsap.quickTo(orbit, "y", { duration: 0.6, ease: "power3" });
    heroSection.addEventListener("mousemove", (e) => {
      const rect = heroSection.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      xTo(relX * 30);
      yTo(relY * 30);
    });
  }
  initHeroParallax();
})();
