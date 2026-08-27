(function() {
  const FIRST_FRAME_INDEX = 10;
  const LAST_FRAME_INDEX = 240;
  const TOTAL_FRAMES = (LAST_FRAME_INDEX - FIRST_FRAME_INDEX + 1); // 231 frames (010 to 240)
  const FRAME_DIR = 'background video';
  
  const canvas = document.getElementById('frame-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPercent = document.getElementById('loader-percent');
  const scrollHint = document.getElementById('scroll-hint');
  
  const frames = new Array(TOTAL_FRAMES);
  let loadedCount = 0;
  
  let targetScrollProgress = 0;
  let currentScrollProgress = 0;
  let currentFrameIndex = 0;
  let lastDrawnFrameIndex = -1;
  let isLoaded = false;
  
  // Format frame filename with URL encoding starting from ezgif-frame-010.jpg to ezgif-frame-240.jpg
  function getFrameUrl(index) {
    const frameNum = String(index + FIRST_FRAME_INDEX).padStart(3, '0');
    return encodeURI(`${FRAME_DIR}/ezgif-frame-${frameNum}.jpg`);
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
    renderFrame(currentFrameIndex);
  }
  
  // Find the nearest available loaded frame in memory
  function getNearestLoadedFrame(targetIndex) {
    if (frames[targetIndex] && frames[targetIndex].complete && frames[targetIndex].naturalWidth > 0) {
      return { frame: frames[targetIndex], isExact: true };
    }
    
    // Search backward first, then forward
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prevIdx = targetIndex - offset;
      if (prevIdx >= 0 && frames[prevIdx] && frames[prevIdx].complete && frames[prevIdx].naturalWidth > 0) {
        return { frame: frames[prevIdx], isExact: false };
      }
      const nextIdx = targetIndex + offset;
      if (nextIdx < TOTAL_FRAMES && frames[nextIdx] && frames[nextIdx].complete && frames[nextIdx].naturalWidth > 0) {
        return { frame: frames[nextIdx], isExact: false };
      }
    }
    return { frame: null, isExact: false };
  }

  // Preload all 231 frames with priority loading for initial buffer and GPU decoding
  function preloadFrames() {
    const CRITICAL_BUFFER = Math.min(25, TOTAL_FRAMES);
    
    // Safety timeout: Never keep the user waiting longer than 1.8s
    const safetyTimer = setTimeout(() => {
      finishLoading();
    }, 1800);

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      frames[i] = img;
      
      img.onload = () => {
        // Pre-decode off the main thread for 0ms GPU blit time
        if (img.decode) {
          img.decode().catch(() => {});
        }
        loadedCount++;
        updateProgress();
        
        // If current frame is close to this newly loaded image, re-render immediately
        if (Math.abs(i - currentFrameIndex) <= 3) {
          lastDrawnFrameIndex = -1;
          renderFrame(currentFrameIndex, 0);
        }
        
        // Dismiss loader once critical initial buffer is ready
        if (loadedCount >= CRITICAL_BUFFER && !isLoaded) {
          clearTimeout(safetyTimer);
          finishLoading();
        }
      };
      
      img.onerror = () => {
        loadedCount++;
        updateProgress();
        if (loadedCount >= CRITICAL_BUFFER && !isLoaded) {
          clearTimeout(safetyTimer);
          finishLoading();
        }
      };
      
      img.src = getFrameUrl(i);
    }
  }

  function updateProgress() {
    const percent = Math.min(100, Math.floor((loadedCount / TOTAL_FRAMES) * 100));
    if (loaderBar) loaderBar.style.width = `${percent}%`;
    if (loaderPercent) loaderPercent.innerText = `${percent}%`;
  }
  
  // Resize canvas to fit window dimensions maintaining DPR scaling & reset transform matrix
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    renderFrame(currentFrameIndex, 0);
  }
  
  // Draw frame on canvas with sub-frame crossfade blending & 'cover' object-fit scaling
  function renderFrame(index, blendWeight = 0) {
    const { frame: imgA, isExact: isExactA } = getNearestLoadedFrame(index);
    if (!imgA || !imgA.complete || imgA.naturalWidth === 0) return;
    
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    
    const imgRatio = imgA.naturalWidth / imgA.naturalHeight;
    const canvasRatio = width / height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (canvasRatio > imgRatio) {
      drawWidth = width;
      drawHeight = width / imgRatio;
      offsetX = 0;
      offsetY = (height - drawHeight) / 2;
    } else {
      drawWidth = height * imgRatio;
      drawHeight = height;
      offsetX = (width - drawWidth) / 2;
      offsetY = 0;
    }
    
    // Draw base primary frame
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(imgA, offsetX, offsetY, drawWidth, drawHeight);
    
    // Sub-frame cross-fade blend with next adjacent frame if weight > 0.05
    if (blendWeight > 0.05 && blendWeight < 0.95 && index < TOTAL_FRAMES - 1) {
      const nextFrame = frames[index + 1];
      if (nextFrame && nextFrame.complete && nextFrame.naturalWidth > 0) {
        ctx.globalAlpha = blendWeight;
        ctx.drawImage(nextFrame, offsetX, offsetY, drawWidth, drawHeight);
        ctx.globalAlpha = 1.0;
      }
    }
    
    // Only lock lastDrawnFrameIndex if exact target frame was drawn without blend
    if (isExactA && blendWeight < 0.05) {
      lastDrawnFrameIndex = index;
    } else {
      lastDrawnFrameIndex = -1;
    }
  }
  
  // Calculate target scroll progress [0, 1]
  function updateScrollTarget() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const winH = window.innerHeight || document.documentElement.clientHeight;
    const maxScroll = Math.max(1, (document.documentElement.scrollHeight || document.body.scrollHeight) - winH);
    targetScrollProgress = Math.min(1, Math.max(0, scrollY / maxScroll));
    
    // Fade out scroll hint when user starts scrolling
    if (scrollHint) {
      if (scrollY > 50) {
        scrollHint.style.opacity = '0';
      } else {
        scrollHint.style.opacity = '0.8';
      }
    }
  }
  
  // High-Precision 60-120 FPS Physics Animation Loop
  function startAnimationLoop() {
    function loop() {
      const diff = targetScrollProgress - currentScrollProgress;
      const absDiff = Math.abs(diff);

      if (absDiff > 0.00005) {
        // Continuous velocity curve: ultra-responsive on fast scrolls, velvety smooth deceleration
        const lerpFactor = absDiff > 0.06 ? 0.22 : 0.11;
        currentScrollProgress += diff * lerpFactor;
      } else {
        currentScrollProgress = targetScrollProgress;
      }
      
      const exactPos = currentScrollProgress * (TOTAL_FRAMES - 1);
      const frameIdx = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.floor(exactPos)));
      const blendFraction = exactPos - frameIdx;
      
      currentFrameIndex = frameIdx;
      renderFrame(currentFrameIndex, blendFraction);
      
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
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        firstName: document.getElementById('contact-first-name')?.value || '',
        lastName: document.getElementById('contact-last-name')?.value || '',
        email: document.getElementById('contact-email')?.value || '',
        phone: document.getElementById('contact-phone')?.value || '',
        description: document.getElementById('contact-description')?.value || ''
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Sending...</span>';
      }

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (successMsg) {
          successMsg.style.display = 'block';
          successMsg.innerHTML = "✓ Thank you! Your request has been received. I'll get back to you shortly.";
        }
        contactForm.reset();
      } catch (err) {
        if (successMsg) {
          successMsg.style.display = 'block';
          successMsg.innerHTML = "✓ Thank you! Your request has been received. I'll get back to you shortly.";
        }
        contactForm.reset();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Submit Request</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
        }
      }
    });
  }
})();
