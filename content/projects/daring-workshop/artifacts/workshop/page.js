// Shared by the DARING pages: no orphaned words, copy buttons, bilingual briefs on touch screens.
    // No orphans: join the last two words of every text block with a non-breaking space,
    // so a single word can never end up alone on the last line (English and Hebrew alike).
    for (const el of document.querySelectorAll('p, li, td, small, h1, h2, h3, .brief span, .i-title, .needs, .os-text')) {
      const nodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      // walk back from the end to the last space between two words, even when it sits before an inline element
      let seenText = false;
      for (let k = nodes.length - 1; k >= 0; k--) {
        const v = nodes[k].nodeValue;
        if (!v.trim()) continue; // whitespace between elements (e.g. list items) is layout, not a space between words
        let i = v.length - 1;
        if (!seenText) { while (i >= 0 && /\s/.test(v[i])) i--; if (i < 0) continue; seenText = true; }
        const j = v.slice(0, i + 1).search(/\s(?=\S*$)/);
        if (j >= 0 && (j > 0 || k > 0)) { nodes[k].nodeValue = v.slice(0, j) + '\u00A0' + v.slice(j + 1); break; }
      }
    }
    // Copy buttons for commands (works when the page is opened straight from the folder too)
    for (const btn of document.querySelectorAll('.copy')) btn.addEventListener('click', async () => {
      const text = btn.previousElementSibling.textContent.replace(/\u00A0/g, ' ');
      try { await navigator.clipboard.writeText(text); } catch {
        const t = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
      }
      const label = btn.dataset.label ??= btn.textContent;
      btn.textContent = document.documentElement.lang === 'he' ? 'הועתק' : 'Copied'; btn.classList.add('done');
      setTimeout(() => { btn.textContent = label; btn.classList.remove('done'); }, 1600);
    });
    // Touch screens have no hover: a tap switches a brief to its other language.
    if (document.querySelector(".hint-pointer") && window.matchMedia('(hover: none)').matches) {
      document.querySelector('.hint-pointer').hidden = true;
      document.querySelector('.hint-touch').hidden = false;
      for (const b of document.querySelectorAll('.brief.bi')) b.addEventListener('click', () => b.classList.toggle('show-alt'));
    }

// Camera & microphone test (get-ready page): shows the picture and a level bar, records nothing, sends nothing.
const T = document.documentElement.lang === 'he' ? {
  test: 'בדיקת מצלמה ומיקרופון', stop: 'עצירת הבדיקה', stopped: 'הבדיקה נעצרה.', asking: 'מבקשים מ־Chrome גישה למצלמה ולמיקרופון…',
  denied: 'Chrome לא קיבל הרשאה. עשו את הצעד של System Settings שלמטה ונסו שוב.', none: 'לא נמצאו מצלמה או מיקרופון. האם הם מחוברים?',
  failed: (m) => `זה לא עבד: ${m}`, working: 'עובד: אתם אמורים לראות את עצמכם, והפס אמור לזוז כשאתם מדברים.', finished: 'הבדיקה הסתיימה. הכל תקין.',
} : {
  test: 'Test camera & microphone', stop: 'Stop test', stopped: 'Test stopped.', asking: 'Asking Chrome for the camera and microphone…',
  denied: 'Chrome was not allowed to use them. Follow the System Settings step below, then try again.', none: 'No camera or microphone was found. Is one connected?',
  failed: (m) => `It didn't work: ${m}`, working: 'Working: you should see yourself, and the bar should move when you speak.', finished: 'Test finished. All good.',
};
for (const box of document.querySelectorAll('.media-test')) {
  const btn = box.querySelector('.media-btn'), video = box.querySelector('.media-video'), meter = box.querySelector('.media-meter');
  const status = box.querySelector('.media-status');
  let stream = null, ctx = null, raf = 0, timer = 0;
  const stop = () => {
    cancelAnimationFrame(raf); clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    ctx?.close(); ctx = null;
    video.hidden = true; meter.hidden = true; btn.textContent = T.test;
  };
  btn.addEventListener('click', async () => {
    if (stream) { stop(); status.textContent = T.stopped; return; }
    status.textContent = T.asking;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      status.textContent = e.name === 'NotAllowedError'
        ? T.denied
        : e.name === 'NotFoundError' ? T.none : T.failed(e.message);
      box.dataset.result = 'error';
      return;
    }
    video.srcObject = stream; video.hidden = false; meter.hidden = false; await video.play();
    ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const bar = meter.firstElementChild;
    (function tick() {
      an.getFloatTimeDomainData(buf);
      let s = 0; for (const v of buf) s += v * v;
      const db = 10 * Math.log10(s / buf.length + 1e-12);
      bar.style.width = `${Math.max(0, Math.min(100, (db + 60) * 2))}%`;
      raf = requestAnimationFrame(tick);
    })();
    btn.textContent = T.stop;
    status.textContent = T.working;
    box.dataset.result = 'ok';
    timer = setTimeout(() => { stop(); status.textContent = T.finished; }, 20000);
  });
}
