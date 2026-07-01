(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const labFeed = document.querySelector("#lab-feed");
  if (labFeed && window.location.hash === "#lab-feed") {
    // 直达锚点时浏览器可能先按未完成的初始布局定位；等样式和首帧布局稳定后再校准一次。
    const syncInitialHash = () => {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo({ top: labFeed.offsetTop, left: 0, behavior: "auto" });
      document.documentElement.style.scrollBehavior = previousBehavior;
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncInitialHash);
    });
    window.addEventListener("load", syncInitialHash, { once: true });
  }

  // 终端只负责展示氛围，不参与路由逻辑，后续可把命令映射到真实导航。
  const terminal = document.querySelector("[data-terminal]");
  if (terminal) {
    const output = terminal.querySelector("[data-terminal-text]");
    const commands = JSON.parse(terminal.dataset.commands || "[]");
    let commandIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const tick = () => {
      if (!output || reduceMotion || commands.length === 0) return;

      const current = commands[commandIndex];
      output.textContent = current.slice(0, charIndex);

      if (!deleting && charIndex <= current.length) {
        charIndex += 1;
      } else if (deleting && charIndex > 0) {
        charIndex -= 1;
      }

      if (charIndex > current.length + 7) deleting = true;
      if (deleting && charIndex === 0) {
        deleting = false;
        commandIndex = (commandIndex + 1) % commands.length;
      }

      window.setTimeout(tick, deleting ? 48 : 92);
    };

    tick();
  }

  const dialog = document.querySelector("[data-announcement-dialog]");
  const openButton = document.querySelector("[data-announcement-open]");
  openButton?.addEventListener("click", () => {
    if (dialog instanceof HTMLDialogElement) dialog.showModal();
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.getAttribute("data-tool");

      if (tool === "theme") {
        document.documentElement.toggleAttribute("data-candy");
      }

      if (tool === "quiet") {
        document.documentElement.toggleAttribute("data-quiet");
      }

      if (tool === "search") {
        window.location.href = "/blog/";
      }
    });
  });

  const scrollRail = document.querySelector("[data-scroll-rail]");
  if (scrollRail) {
    // 滚动提示条只暴露一个 CSS 变量，视觉如何表现交给样式层，避免 JS 直接操作布局细节。
    const updateScrollRail = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      scrollRail.style.setProperty("--scroll-progress", progress.toFixed(3));
    };

    updateScrollRail();
    window.addEventListener("scroll", updateScrollRail, { passive: true });
    window.addEventListener("resize", updateScrollRail);
  }

  const heroSection = document.querySelector(".hero-section");
  if (heroSection) {
    // 首屏固定工具只服务主视觉；滚入个人标签页后收起，避免第二屏被首页元素覆盖。
    const updateHeroState = () => {
      const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
      document.body.classList.toggle("is-past-hero", window.scrollY > heroBottom - 80);
    };

    updateHeroState();
    window.addEventListener("scroll", updateHeroState, { passive: true });
    window.addEventListener("resize", updateHeroState);
  }

  const physicsTags = document.querySelector("[data-physics-tags]");
  if (physicsTags && !reduceMotion && window.matchMedia("(min-width: 720px)").matches) {
    const tagItems = [...physicsTags.querySelectorAll(".personal-tag")];
    let bodies = [];
    let animationId = 0;
    let lastTime = 0;
    let startedAt = 0;
    let settleSince = 0;
    let started = false;
    let resizeTimer = 0;
    const maxAngle = (7 * Math.PI) / 180;
    const tagSlots = [
      [0.12, 0.28, -9],
      [0.18, 0.72, -20],
      [0.27, 0.48, 16],
      [0.35, 0.66, 1],
      [0.43, 0.56, -7],
      [0.51, 0.76, 10],
      [0.59, 0.52, 5],
      [0.67, 0.7, -12],
      [0.75, 0.48, 8],
      [0.82, 0.64, -13],
      [0.9, 0.78, 2],
      [0.7, 0.32, 14],
      [0.31, 0.82, -7],
      [0.52, 0.36, -3],
    ];

    // 胶囊标签的物理效果是装饰层：链接仍是原来的 a 标签，物理坐标只控制视觉位置。
    const setupBodies = () => {
      const bounds = physicsTags.getBoundingClientRect();
      physicsTags.classList.add("is-physics");
      physicsTags.classList.remove("is-settled");

      bodies = tagItems.map((tag, index) => {
        const width = tag.offsetWidth;
        const height = tag.offsetHeight;
        const [slotX, slotY, slotAngle] = tagSlots[index % tagSlots.length];
        const targetX = bounds.width * slotX - width / 2;
        const targetY = bounds.height * slotY - height / 2;
        const angle = (slotAngle * Math.PI) / 180;
        const maxX = Math.max(18, bounds.width - width - 18);
        const maxY = Math.max(34, bounds.height - height - 28);

        return {
          el: tag,
          width,
          height,
          x: Math.max(18, Math.min(maxX, targetX + Math.sin(index * 2.17) * 34)),
          y: -height - index * 30,
          targetX: Math.max(18, Math.min(maxX, targetX)),
          targetY: Math.max(34, Math.min(maxY, targetY)),
          vx: Math.sin(index * 1.73) * 1.2,
          vy: 3 + index * 0.05,
          angle: angle - Math.sign(angle || 1) * 0.08,
          targetAngle: angle,
          angularVelocity: Math.sin(index * 0.91) * 0.004,
          mass: Math.max(1, width / 120),
        };
      });
    };

    const renderBodies = () => {
      bodies.forEach((body) => {
        body.el.style.transform = `translate3d(${body.x}px, ${body.y}px, 0) rotate(${body.angle}rad)`;
      });
    };

    const step = (time) => {
      const bounds = physicsTags.getBoundingClientRect();
      const dt = Math.min((time - lastTime) / 16.67 || 1, 2);
      lastTime = time;

      bodies.forEach((body) => {
        const minY = 8;
        const maxY = Math.max(minY, bounds.height - body.height - 12);
        const spring = body.y < body.targetY ? 0.018 : 0.075;
        body.vx += (body.targetX - body.x) * 0.012 * dt;
        body.vy += (body.targetY - body.y) * spring * dt;
        body.vx *= 0.86;
        body.vy *= 0.86;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angularVelocity += (body.targetAngle - body.angle) * 0.01 * dt;
        body.angularVelocity *= 0.84;
        body.angle += body.angularVelocity * dt;

        if (body.angle > maxAngle || body.angle < -maxAngle) {
          body.angle = Math.max(-maxAngle, Math.min(maxAngle, body.angle));
          body.angularVelocity *= -0.28;
        }

        if (body.x < 16) {
          body.x = 16;
          body.vx = Math.abs(body.vx) * 0.62;
          body.angularVelocity *= -0.7;
        }

        if (body.x + body.width > bounds.width - 16) {
          body.x = bounds.width - body.width - 16;
          body.vx = -Math.abs(body.vx) * 0.62;
          body.angularVelocity *= -0.7;
        }

        // 碰撞分离可能把标签挤出容器上下边界，边界回弹能避免静止后看起来突然“飞走”。
        if (body.y < minY) {
          body.y = minY;
          body.vy = Math.abs(body.vy) * 0.48;
          body.angularVelocity *= -0.48;
        }

        if (body.y > maxY) {
          body.y = maxY;
          body.vy = -Math.abs(body.vy) * 0.5;
          body.angularVelocity *= -0.52;
        }
      });

      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i];
          const b = bodies[j];
          const ax = a.x + a.width / 2;
          const ay = a.y + a.height / 2;
          const bx = b.x + b.width / 2;
          const by = b.y + b.height / 2;
          const minX = (a.width + b.width) / 2 + 8;
          const minY = (a.height + b.height) / 2 + 8;
          const dx = bx - ax;
          const dy = by - ay;

          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const overlapX = minX - Math.abs(dx);
            const overlapY = minY - Math.abs(dy);

            if (overlapX < overlapY) {
              const push = (overlapX / 2) * Math.sign(dx || 1);
              a.x -= push * 0.38;
              b.x += push * 0.38;
              const impulse = (b.vx - a.vx) * 0.16;
              a.vx += impulse;
              b.vx -= impulse;
            } else {
              const push = (overlapY / 2) * Math.sign(dy || 1);
              a.y -= push * 0.34;
              b.y += push * 0.34;
              const impulse = (b.vy - a.vy) * 0.14;
              a.vy += impulse;
              b.vy -= impulse;
            }

            [a, b].forEach((body) => {
              const maxY = Math.max(8, bounds.height - body.height - 12);
              body.y = Math.max(8, Math.min(maxY, body.y));
            });
            a.angularVelocity -= 0.0003 * Math.sign(dx || 1);
            b.angularVelocity += 0.0003 * Math.sign(dx || 1);
          }
        }
      }

      renderBodies();

      const settled = bodies.every(
        (body) =>
          Math.abs(body.targetX - body.x) < 2 &&
          Math.abs(body.targetY - body.y) < 2 &&
          Math.abs(body.vy) < 0.18 &&
          Math.abs(body.vx) < 0.18,
      );
      if (settled) {
        settleSince ||= time;
      } else {
        settleSince = 0;
      }

      if ((settleSince && time - settleSince > 900) || (startedAt && time - startedAt > 5200)) {
        freezeBodies();
        return;
      }

      animationId = window.requestAnimationFrame(step);
    };

    const startPhysics = () => {
      if (started) return;
      started = true;
      setupBodies();
      renderBodies();
      animationId = window.requestAnimationFrame((time) => {
        lastTime = time;
        startedAt = time;
        step(time);
      });
    };

    const freezeBodies = () => {
      bodies.forEach((body) => {
        // 静止收尾时冻结当前视觉位置，避免突然吸附到预设坐标造成跳变。
        body.vx = 0;
        body.vy = 0;
        body.angularVelocity = 0;
      });
      renderBodies();
      physicsTags.classList.add("is-settled");
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          startPhysics();
          observer.disconnect();
        }
      },
      { threshold: 0.24 },
    );

    observer.observe(physicsTags);

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!started) return;
        window.cancelAnimationFrame(animationId);
        settleSince = 0;
        setupBodies();
        renderBodies();
        animationId = window.requestAnimationFrame((time) => {
          lastTime = time;
          startedAt = time;
          step(time);
        });
      }, 180);
    });
  }

  const counter = document.querySelector("[data-click-counter]");
  if (counter) {
    const countNode = counter.querySelector("[data-click-count]");
    const button = counter.querySelector("[data-click-button]");
    let count = 0;

    button?.addEventListener("click", () => {
      count += 1;
      if (countNode) countNode.textContent = String(count);
    });
  }
})();
