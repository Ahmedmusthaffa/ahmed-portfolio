(function() {
  const FIRST_FRAME_INDEX = 24; // Trim initial 1 second (24 frames) to eliminate left-side shadow
  const LAST_FRAME_INDEX = 191;
  const TOTAL_FRAMES = (LAST_FRAME_INDEX - FIRST_FRAME_INDEX + 1); // 168 clean Studio HD frames (024 to 191)
  const FRAME_DIR = 'background video-hd';
  
  const canvas = document.getElementById('frame-canvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPercent = document.getElementById('loader-percent');
  const scrollHint = document.getElementById('scroll-hint');
  
  const frames = new Array(TOTAL_FRAMES);
  const bitmaps = new Array(TOTAL_FRAMES);
  const requestedIndices = new Set();
  let loadedCount = 0;
  
  let targetScrollProgress = 0;
  let currentScrollProgress = 0;
  let currentFrameIndex = 0;
  let lastDrawnSource = null;
  let lastDrawnFrameIndex = -1;
  let isLoaded = false;
  let needsRedraw = false;
  
  // Cache layout metrics to eliminate forced reflows during scroll
  let cachedMaxScroll = 1;
  let cachedWinW = window.innerWidth || 1920;
  let cachedWinH = window.innerHeight || 1080;
  
  function updateScrollMetrics() {
    cachedWinW = window.innerWidth || document.documentElement.clientWidth;
    cachedWinH = window.innerHeight || document.documentElement.clientHeight;
    const docH = Math.max(
      document.body.scrollHeight || 0,
      document.documentElement.scrollHeight || 0
    );
    cachedMaxScroll = Math.max(1, docH - cachedWinH);
  }

  function getFrameUrl(index) {
    const frameNum = String(index + FIRST_FRAME_INDEX).padStart(3, '0');
    return `${FRAME_DIR}/frame-${frameNum}.webp`;
  }

  function finishLoading() {
    if (isLoaded) return;
    isLoaded = true;
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => {
        loader.style.display = 'none';
      }, 350);
    }
    needsRedraw = true;
  }
  
  // Fast nearest-frame lookup with cached index
  function getNearestLoadedFrame(targetIndex) {
    if (bitmaps[targetIndex]) {
      return { frame: bitmaps[targetIndex], isExact: true };
    }
    if (frames[targetIndex] && frames[targetIndex].complete && frames[targetIndex].naturalWidth > 0) {
      return { frame: frames[targetIndex], isExact: true };
    }
    
    // Look outwards in both directions
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prevIdx = targetIndex - offset;
      if (prevIdx >= 0) {
        if (bitmaps[prevIdx]) return { frame: bitmaps[prevIdx], isExact: false };
        if (frames[prevIdx] && frames[prevIdx].complete && frames[prevIdx].naturalWidth > 0) return { frame: frames[prevIdx], isExact: false };
      }
      const nextIdx = targetIndex + offset;
      if (nextIdx < TOTAL_FRAMES) {
        if (bitmaps[nextIdx]) return { frame: bitmaps[nextIdx], isExact: false };
        if (frames[nextIdx] && frames[nextIdx].complete && frames[nextIdx].naturalWidth > 0) return { frame: frames[nextIdx], isExact: false };
      }
    }
    return { frame: null, isExact: false };
  }

  // Paced Loading Queue (Prevents network & main thread congestion)
  const loadQueue = [];
  let activeLoads = 0;
  const MAX_CONCURRENT_LOADS = 8;

  function processQueue() {
    while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
      const item = loadQueue.shift();
      executeLoadFrame(item.index, item.priority);
    }
  }

  function queueFrame(i, priority = false) {
    if (i < 0 || i >= TOTAL_FRAMES || requestedIndices.has(i)) return;
    requestedIndices.add(i);

    if (priority) {
      loadQueue.unshift({ index: i, priority: true });
    } else {
      loadQueue.push({ index: i, priority: false });
    }
    processQueue();
  }

  function executeLoadFrame(i, priority = false) {
    activeLoads++;
    const url = getFrameUrl(i);

    if (typeof window.createImageBitmap === 'function' && typeof window.fetch === 'function') {
      fetch(url, { priority: priority ? 'high' : 'auto' })
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed');
          return res.blob();
        })
        .then(blob => createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'premultiply' }))
        .then(bmp => {
          bitmaps[i] = bmp;
          onFrameReady(i);
        })
        .catch(() => {
          fallbackLoadImage(i, url, priority);
        })
        .finally(() => {
          activeLoads--;
          processQueue();
        });
      return;
    }

    fallbackLoadImage(i, url, priority);
  }

  function fallbackLoadImage(i, url, priority) {
    const img = new Image();
    if (priority) img.fetchPriority = 'high';
    frames[i] = img;

    img.onload = () => {
      onFrameReady(i);
      activeLoads = Math.max(0, activeLoads - 1);
      processQueue();
    };

    img.onerror = () => {
      activeLoads = Math.max(0, activeLoads - 1);
      processQueue();
    };

    img.src = url;
  }

  function onFrameReady(i) {
    loadedCount++;
    if (!isLoaded) {
      const percent = Math.min(100, Math.floor((loadedCount / 18) * 100));
      if (loaderBar) loaderBar.style.width = `${percent}%`;
      if (loaderPercent) loaderPercent.innerText = `${percent}%`;
      if (loadedCount >= 10 || (bitmaps[0] && bitmaps[4])) {
        finishLoading();
      }
    }
    if (Math.abs(i - currentFrameIndex) <= 2) {
      needsRedraw = true;
    }
  }

  function preloadFrames() {
    // 1. Critical hero frames first
    for (let i = 0; i < Math.min(16, TOTAL_FRAMES); i++) {
      queueFrame(i, true);
    }

    // 2. Uniform keyframes across whole video
    for (let i = 16; i < TOTAL_FRAMES; i += 3) {
      queueFrame(i, false);
    }

    // 3. Fallback loader dismiss
    setTimeout(finishLoading, 1000);

    // 4. Fill in remaining frames steadily in background
    setTimeout(() => {
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        if (!requestedIndices.has(i)) {
          queueFrame(i, false);
        }
      }
    }, 300);
  }

  // Prioritize streaming around user's active viewport position
  function streamNearFrames(centerIdx) {
    const WINDOW_RADIUS = 16;
    const start = Math.max(0, centerIdx - WINDOW_RADIUS);
    const end = Math.min(TOTAL_FRAMES - 1, centerIdx + WINDOW_RADIUS);
    for (let i = start; i <= end; i++) {
      if (!requestedIndices.has(i)) {
        queueFrame(i, true);
      }
    }
  }

  // Smooth Canvas Resizing without DPR memory bloat
  function resizeCanvas() {
    updateScrollMetrics();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    
    canvas.width = Math.round(cachedWinW * dpr);
    canvas.height = Math.round(cachedWinH * dpr);
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    
    lastDrawnSource = null;
    lastDrawnFrameIndex = -1;
    needsRedraw = true;
  }

  // Fast single-pass frame renderer
  function renderFrame(index) {
    const { frame: img } = getNearestLoadedFrame(index);
    if (!img) return;
    
    // Skip redraw if identical frame is already displayed
    if (img === lastDrawnSource && index === lastDrawnFrameIndex) return;

    const naturalW = img.width || img.naturalWidth || 1920;
    const naturalH = img.height || img.naturalHeight || 1080;

    const imgRatio = naturalW / naturalH;
    const canvasRatio = cachedWinW / cachedWinH;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (canvasRatio > imgRatio) {
      drawWidth = Math.round(cachedWinW);
      drawHeight = Math.round(cachedWinW / imgRatio);
      offsetX = 0;
      offsetY = Math.round((cachedWinH - drawHeight) * 0.5);
    } else {
      drawWidth = Math.round(cachedWinH * imgRatio);
      drawHeight = Math.round(cachedWinH);
      offsetX = Math.round((cachedWinW - drawWidth) * 0.5);
      offsetY = 0;
    }
    
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    
    lastDrawnSource = img;
    lastDrawnFrameIndex = index;
    needsRedraw = false;
  }

  // Lenis Virtual Momentum Smooth Scrolling
  let lenis = null;
  const hasLenis = typeof window.Lenis === 'function';

  if (hasLenis) {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      infinite: false,
    });

    lenis.on('scroll', (e) => {
      targetScrollProgress = Math.min(1, Math.max(0, e.progress));
      const estimatedFrame = Math.round(targetScrollProgress * (TOTAL_FRAMES - 1));
      streamNearFrames(estimatedFrame);

      if (scrollHint) {
        if (e.animatedScroll > 50) {
          scrollHint.style.opacity = '0';
        } else {
          scrollHint.style.opacity = '0.8';
        }
      }
    });

    function lenisRafLoop(time) {
      lenis.raf(time);
      requestAnimationFrame(lenisRafLoop);
    }
    requestAnimationFrame(lenisRafLoop);
  }

  // Fallback native scroll handler if Lenis is not active
  function updateScrollTargetNative() {
    if (hasLenis) return;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    targetScrollProgress = Math.min(1, Math.max(0, scrollY / cachedMaxScroll));
    
    const estimatedFrame = Math.round(targetScrollProgress * (TOTAL_FRAMES - 1));
    streamNearFrames(estimatedFrame);
    
    if (scrollHint) {
      if (scrollY > 50) {
        scrollHint.style.opacity = '0';
      } else {
        scrollHint.style.opacity = '0.8';
      }
    }
  }

  // Silky 60-120 FPS Animation Loop (Unified with Lenis Momentum)
  function startAnimationLoop() {
    function loop() {
      const diff = targetScrollProgress - currentScrollProgress;
      const absDiff = Math.abs(diff);

      if (hasLenis) {
        // With Lenis, scroll is already momentum-interpolated at 60-120hz
        currentScrollProgress = targetScrollProgress;
        needsRedraw = true;
      } else {
        // Fallback exponential lerp for non-Lenis browsers
        if (absDiff > 0.00015) {
          const lerpFactor = absDiff > 0.08 ? 0.38 : 0.28;
          currentScrollProgress += diff * lerpFactor;
          needsRedraw = true;
        } else if (currentScrollProgress !== targetScrollProgress) {
          currentScrollProgress = targetScrollProgress;
          needsRedraw = true;
        }
      }
      
      const frameIdx = Math.min(
        TOTAL_FRAMES - 1,
        Math.max(0, Math.round(currentScrollProgress * (TOTAL_FRAMES - 1)))
      );
      
      if (frameIdx !== currentFrameIndex) {
        currentFrameIndex = frameIdx;
        needsRedraw = true;
      }

      if (needsRedraw) {
        renderFrame(currentFrameIndex);
      }
      
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  
  // Mobile & Desktop Event Listeners with Debounce
  let resizeTimer = null;
  function onWindowResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      if (lenis) lenis.resize();
      if (!hasLenis) updateScrollTargetNative();
    }, 40);
  }

  window.addEventListener('scroll', updateScrollTargetNative, { passive: true });
  window.addEventListener('resize', onWindowResize, { passive: true });
  window.addEventListener('orientationchange', onWindowResize, { passive: true });
  window.addEventListener('touchstart', updateScrollTargetNative, { passive: true });
  window.addEventListener('touchmove', updateScrollTargetNative, { passive: true });
  
  // Smooth scroll for internal anchor clicks
  document.addEventListener('DOMContentLoaded', () => {
    updateScrollMetrics();
    resizeCanvas();
    if (!hasLenis) updateScrollTargetNative();

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const hash = this.getAttribute('href');
        if (hash && hash !== '#') {
          const targetEl = document.querySelector(hash);
          if (targetEl) {
            e.preventDefault();
            if (lenis) {
              lenis.scrollTo(targetEl, { duration: 1.2 });
            } else {
              targetEl.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }
      });
    });

    // Active navigation state for Mobile Bottom Dock
    const dockItems = document.querySelectorAll('.mobile-bottom-dock .dock-item');
    const trackedSections = [
      { id: 'home', el: document.getElementById('home') },
      { id: 'about', el: document.getElementById('about') },
      { id: 'skills', el: document.getElementById('skills') },
      { id: 'projects', el: document.getElementById('projects') },
      { id: 'contact', el: document.getElementById('contact') }
    ].filter(s => s.el !== null);

    function updateActiveDock() {
      if (!dockItems.length || !trackedSections.length) return;
      const scrollY = window.scrollY || window.pageYOffset;
      const offset = window.innerHeight * 0.35;
      let currentSectionId = trackedSections[0].id;

      for (let i = 0; i < trackedSections.length; i++) {
        const top = trackedSections[i].el.offsetTop - offset;
        if (scrollY >= top) {
          currentSectionId = trackedSections[i].id;
        }
      }

      dockItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href === '#' + currentSectionId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    window.addEventListener('scroll', updateActiveDock, { passive: true });
    updateActiveDock();
  });

  // Initialize
  updateScrollMetrics();
  resizeCanvas();
  preloadFrames();
  startAnimationLoop();
  if (!hasLenis) updateScrollTargetNative();

  // Interactive Logo Badge Controller
  const badge = document.getElementById('round-code-badge');
  if (badge) {
    const MORPH_TOKENS = ['</>', '{...}', 'npm', 'git', '🚀', '⚡', 'Ahmed', '</>'];
    let morphInterval = null;
    let morphIdx = 0;

    badge.addEventListener('mouseenter', () => {
      badge.classList.add('morphing');
      clearInterval(morphInterval);
      morphIdx = 0;
      morphInterval = setInterval(() => {
        morphIdx++;
        if (morphIdx < MORPH_TOKENS.length) {
          badge.innerText = MORPH_TOKENS[morphIdx];
        } else {
          clearInterval(morphInterval);
          badge.innerText = '</>';
        }
      }, 120);
    });

    badge.addEventListener('mousemove', (e) => {
      const rect = badge.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      badge.style.transform = `translate(${x * 0.28}px, ${y * 0.28}px) scale(1.15) rotate(${x * 0.3}deg)`;
    });

    badge.addEventListener('mouseleave', () => {
      clearInterval(morphInterval);
      badge.classList.remove('morphing');
      badge.innerText = '</>';
      badge.style.transform = '';
    });

    // Particle Burst on Click
    badge.addEventListener('click', (e) => {
      const parent = badge.parentElement;
      const count = 10;
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('div');
        spark.className = 'spark-particle';
        const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.4);
        const distance = 40 + Math.random() * 35;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        spark.style.setProperty('--tx', `${tx}px`);
        spark.style.setProperty('--ty', `${ty}px`);
        spark.style.left = '22px';
        spark.style.top = '22px';
        parent.appendChild(spark);
        setTimeout(() => spark.remove(), 750);
      }
    });
  }

  // Contact Form AJAX Handler with Backend Persistence
  const contactForm = document.getElementById('contact-form');
  const successMsg = document.getElementById('form-success-msg');
  const submitBtn = document.getElementById('form-submit-btn');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const payload = {
        firstName: document.getElementById('contact-first-name')?.value.trim() || '',
        lastName: document.getElementById('contact-last-name')?.value.trim() || '',
        email: document.getElementById('contact-email')?.value.trim() || '',
        phone: document.getElementById('contact-phone')?.value.trim() || '',
        description: document.getElementById('contact-description')?.value.trim() || ''
      };

      const clientName = `${payload.firstName} ${payload.lastName}`.trim() || 'Client';
      const clientEmail = payload.email || 'Not provided';
      const clientPhone = payload.phone || 'Not provided';
      const timeStamp = new Date().toLocaleString();

      // Clear, unmistakable subject line showing the client's name & email at a glance
      const subject = encodeURIComponent(`⚡ Lead: ${clientName} (${clientEmail}) - Portfolio Inquiry`);

      // Executive structured layout with client details on top and project description below
      const bodyText = encodeURIComponent(
        `==================================================\n` +
        `⚡ NEW CLIENT INQUIRY - AHMED PORTFOLIO\n` +
        `==================================================\n\n` +
        `👤 CLIENT INFORMATION:\n` +
        `--------------------------------------------------\n` +
        `• Full Name:     ${clientName}\n` +
        `• Email Address: ${clientEmail}\n` +
        `• Phone Number:  ${clientPhone}\n` +
        `• Submitted At:  ${timeStamp}\n\n` +
        `📋 PROJECT DESCRIPTION & REQUIREMENTS:\n` +
        `--------------------------------------------------\n` +
        `${payload.description}\n\n` +
        `==================================================\n` +
        `💡 NOTE FOR AHMED:\n` +
        `Hit "Reply" in your email app to write directly back to ${clientName} at ${clientEmail}.\n` +
        `==================================================`
      );

      const mailtoUrl = `mailto:ahmedmusthaffa02@gmail.com?subject=${subject}&body=${bodyText}`;
      const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=ahmedmusthaffa02@gmail.com&su=${subject}&body=${bodyText}`;

      // Save submission to database in background
      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});

      // Launch default mail client pre-filled
      try {
        window.location.href = mailtoUrl;
      } catch (err) {}

      if (successMsg) {
        successMsg.style.display = 'block';
        successMsg.innerHTML = `
          <div style="background: rgba(204, 255, 0, 0.08); border: 1.5px solid #ccff00; padding: 1.2rem; border-radius: 10px; margin-top: 1.2rem; text-align: center;">
            <p style="color: #ffffff; font-weight: 700; font-size: 1rem; margin-bottom: 0.4rem;">✓ Your Message is Ready to Send!</p>
            <p style="color: rgba(255, 255, 255, 0.75); font-size: 0.85rem; margin-bottom: 1rem;">If your mail app didn't open automatically, choose an option below:</p>
            <div style="display: flex; gap: 0.65rem; justify-content: center; flex-wrap: wrap;">
              <a href="${mailtoUrl}" style="background: #ccff00; color: #000; padding: 0.65rem 1.2rem; border-radius: 50px; font-weight: 800; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem;">
                <span>✉️ Open in Mail App</span>
              </a>
              <a href="${gmailWebUrl}" target="_blank" rel="noopener noreferrer" style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.25); padding: 0.65rem 1.2rem; border-radius: 50px; font-weight: 700; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem;">
                <span>🌐 Open in Gmail Web</span>
              </a>
            </div>
          </div>
        `;
      }

      contactForm.reset();
    });
  }
})();
