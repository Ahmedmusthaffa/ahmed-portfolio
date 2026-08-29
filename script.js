(function() {
  const FIRST_FRAME_INDEX = 24; // Trim initial 1 second (24 frames) to eliminate left-side shadow
  const LAST_FRAME_INDEX = 191;
  const TOTAL_FRAMES = (LAST_FRAME_INDEX - FIRST_FRAME_INDEX + 1); // 168 clean Studio HD frames (024 to 191)
  const FRAME_DIR = 'background video-hd';
  
  const canvas = document.getElementById('frame-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  
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
  let lastDrawnFrameIndex = -1;
  let isLoaded = false;
  
  // Format frame filename with URL encoding starting from frame-024.webp to frame-191.webp
  function getFrameUrl(index) {
    const frameNum = String(index + FIRST_FRAME_INDEX).padStart(3, '0');
    return encodeURI(`${FRAME_DIR}/frame-${frameNum}.webp`);
  }

  function finishLoading() {
    if (isLoaded) return;
    isLoaded = true;
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => {
        loader.style.display = 'none';
      }, 400);
    }
    lastDrawnFrameIndex = -1;
    renderFrame(currentFrameIndex, 0);
  }
  
  // Find the nearest available loaded frame in memory (ImageBitmap or HTMLImageElement)
  function getNearestLoadedFrame(targetIndex) {
    if (bitmaps[targetIndex]) {
      return { frame: bitmaps[targetIndex], isExact: true };
    }
    if (frames[targetIndex] && frames[targetIndex].complete && frames[targetIndex].naturalWidth > 0) {
      return { frame: frames[targetIndex], isExact: true };
    }
    
    // Search backward first, then forward
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

  // Load a single frame with createImageBitmap GPU Acceleration & HTMLImageElement fallback
  function loadFrame(i, priority = false) {
    if (i < 0 || i >= TOTAL_FRAMES || requestedIndices.has(i)) return;
    requestedIndices.add(i);

    const url = getFrameUrl(i);

    // Fast Path: createImageBitmap (Off-thread GPU VRAM texture decoding)
    if (typeof window.createImageBitmap === 'function' && typeof window.fetch === 'function') {
      fetch(url, { priority: priority ? 'high' : 'auto' })
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed');
          return res.blob();
        })
        .then(blob => createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'premultiply' }))
        .then(bmp => {
          bitmaps[i] = bmp;
          loadedCount++;
          updateProgress();
          if (Math.abs(i - currentFrameIndex) <= 4) {
            lastDrawnFrameIndex = -1;
            renderFrame(currentFrameIndex);
          }
        })
        .catch(() => {
          // Fallback to standard Image
          fallbackLoadImage(i, url, priority);
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
      if (img.decode) {
        img.decode().catch(() => {});
      }
      loadedCount++;
      updateProgress();
      if (Math.abs(i - currentFrameIndex) <= 4) {
        lastDrawnFrameIndex = -1;
        renderFrame(currentFrameIndex);
      }
    };

    img.onerror = () => {
      loadedCount++;
      updateProgress();
    };

    img.src = url;
  }

  // Prioritized Two-Phase Streaming:
  // Phase 1: Keyframe skeleton across the whole video (every 4th frame) for instant 100% coverage
  // Phase 2: Active sliding window around the user's scroll position
  function preloadFrames() {
    // 1. Load the first 15 consecutive frames immediately for hero section
    for (let i = 0; i < Math.min(15, TOTAL_FRAMES); i++) {
      loadFrame(i, true);
    }

    // 2. Load keyframes every 4th frame across the entire timeline (0, 4, 8, 12... 230)
    for (let i = 16; i < TOTAL_FRAMES; i += 4) {
      loadFrame(i, false);
    }

    // Dismiss loader quickly once the hero frames are ready
    const initialCheckTimer = setInterval(() => {
      let heroReady = true;
      for (let i = 0; i < 8; i++) {
        if (!bitmaps[i] && (!frames[i] || !frames[i].complete)) {
          heroReady = false;
          break;
        }
      }
      if (heroReady || loadedCount >= 20) {
        clearInterval(initialCheckTimer);
        finishLoading();
      }
    }, 40);

    // Safety timeout: 1.5s max
    setTimeout(() => {
      clearInterval(initialCheckTimer);
      finishLoading();
    }, 1500);

    // 3. Eagerly fill in remaining frames in background
    setTimeout(() => {
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        if (!requestedIndices.has(i)) {
          loadFrame(i, false);
        }
      }
    }, 500);
  }

  // Active Sliding Window Streamer around user's scroll position
  function streamNearFrames(centerIdx) {
    const WINDOW_RADIUS = 20;
    const start = Math.max(0, centerIdx - WINDOW_RADIUS);
    const end = Math.min(TOTAL_FRAMES - 1, centerIdx + WINDOW_RADIUS);
    for (let i = start; i <= end; i++) {
      if (!requestedIndices.has(i)) {
        loadFrame(i, true);
      }
    }
  }

  function updateProgress() {
    const percent = Math.min(100, Math.floor((loadedCount / TOTAL_FRAMES) * 100));
    if (loaderBar) loaderBar.style.width = `${percent}%`;
    if (loaderPercent) loaderPercent.innerText = `${percent}%`;
  }
  
  // Resize canvas to fit window dimensions maintaining 3x DPR scaling & reset transform matrix
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const winW = window.innerWidth || document.documentElement.clientWidth;
    const winH = window.innerHeight || document.documentElement.clientHeight;
    canvas.width = Math.floor(winW * dpr);
    canvas.height = Math.floor(winH * dpr);
    
    // Reset transform matrix before scaling to prevent cumulative zoom multiplication
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Force re-render current frame on resize
    lastDrawnFrameIndex = -1;
    renderFrame(currentFrameIndex);
  }
  
  // Draw single rock-solid frame on canvas with 'cover' object-fit scaling
  function renderFrame(index) {
    if (index === lastDrawnFrameIndex) return;

    const { frame: img, isExact } = getNearestLoadedFrame(index);
    if (!img) return;
    
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    
    const naturalW = img.width || img.naturalWidth;
    const naturalH = img.height || img.naturalHeight;
    if (!naturalW || !naturalH) return;

    const imgRatio = naturalW / naturalH;
    const canvasRatio = width / height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (canvasRatio > imgRatio) {
      drawWidth = Math.round(width);
      drawHeight = Math.round(width / imgRatio);
      offsetX = 0;
      offsetY = Math.round((height - drawHeight) / 2);
    } else {
      drawWidth = Math.round(height * imgRatio);
      drawHeight = Math.round(height);
      offsetX = Math.round((width - drawWidth) / 2);
      offsetY = 0;
    }
    
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    
    if (isExact) {
      lastDrawnFrameIndex = index;
    }
  }
  
  // Calculate target scroll progress [0, 1]
  function updateScrollTarget() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const winH = window.innerHeight || document.documentElement.clientHeight;
    const maxScroll = Math.max(1, (document.documentElement.scrollHeight || document.body.scrollHeight) - winH);
    targetScrollProgress = Math.min(1, Math.max(0, scrollY / maxScroll));
    
    // Proactively stream frames around the targeted scroll point
    const estimatedFrame = Math.round(targetScrollProgress * (TOTAL_FRAMES - 1));
    streamNearFrames(estimatedFrame);
    
    // Fade out scroll hint when user starts scrolling
    if (scrollHint) {
      if (scrollY > 50) {
        scrollHint.style.opacity = '0';
      } else {
        scrollHint.style.opacity = '0.8';
      }
    }
  }
  
  // Rock-Solid Silky Smooth 60-120 FPS Animation Loop
  function startAnimationLoop() {
    function loop() {
      const diff = targetScrollProgress - currentScrollProgress;
      const absDiff = Math.abs(diff);

      if (absDiff > 0.0001) {
        // Smooth exponential damping (responsive & zero oscillation)
        const lerpFactor = absDiff > 0.05 ? 0.22 : 0.14;
        currentScrollProgress += diff * lerpFactor;
      } else {
        currentScrollProgress = targetScrollProgress;
      }
      
      const frameIdx = Math.min(
        TOTAL_FRAMES - 1,
        Math.max(0, Math.round(currentScrollProgress * (TOTAL_FRAMES - 1)))
      );
      
      currentFrameIndex = frameIdx;
      renderFrame(currentFrameIndex);
      
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  
  // Mobile-Optimized Event Listeners
  let resizeTimer = null;
  function onWindowResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      updateScrollTarget();
    }, 60);
  }

  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', onWindowResize);
  window.addEventListener('touchstart', updateScrollTarget, { passive: true });
  window.addEventListener('touchmove', updateScrollTarget, { passive: true });
  window.addEventListener('DOMContentLoaded', () => {
    updateScrollTarget();
    resizeCanvas();
  });

  // Initialize
  resizeCanvas();
  preloadFrames();
  startAnimationLoop();
  updateScrollTarget();

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
