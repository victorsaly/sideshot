// What SideShot draws, run in a browser page (page.evaluate), not in Node: each function is sent to the page as
// its source, so it uses nothing from outside itself. Kept apart from the script so it can be tested on its own.

/** Runs in the page: the swatch least like the colours the pictures already use (marigold when it is free). */
export async function pickAccent({ images, choices }) {
  const hsv = (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0)
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round((h * 60 + 360) % 360), max === 0 ? 0 : d / max, max / 255];
  };
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const hues = new Float64Array(360);
  let total = 0;
  for (const src of images) {
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const w = Math.min(240, img.width), h = Math.max(1, Math.round((img.height * w) / img.width));
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    for (let i = 0; i < d.length; i += 4) {
      total++;
      const [hue, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
      // Greys, whites and blacks clash with nothing; only real colour counts.
      if (s > 0.35 && v > 0.3) hues[hue]++;
    }
  }
  const near = (hue) => {
    let n = 0;
    for (let k = -30; k <= 30; k++) n += hues[(hue + k + 360) % 360];
    return n / Math.max(1, total);
  };
  const scored = choices.map((s) => ({ s, share: near(hsv(...hex(s))[0]) }));
  if (scored[0].share < 0.004) return scored[0].s;
  return scored.reduce((a, b) => (b.share < a.share ? b : a)).s;
}

/** Runs in the page: draws what changed, the numbered rings and the SideShot tag on one picture. */
export async function finish({ src, before, rings, colour, scale, tag }) {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const b = await load(src);
  const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d');
  x.drawImage(b, 0, 0);
  let changed = 0;
  if (before) {
    const a = await load(before);
    // Rows are lined up the way a text diff lines up lines, so content that only moved (something above it
    // was added or taken out) is not marked; what was added or changed is boxed, what was taken out is a rule.
    // A stretch of identical rows (blank page, the empty inside of a card) is lined up as one, whatever its
    // height: space that only grew or shrank then lines up with itself, never with content.
    const rowsOf = (img) => {
      const oc = new OffscreenCanvas(img.width, img.height), ox = oc.getContext('2d');
      ox.drawImage(img, 0, 0);
      const d = ox.getImageData(0, 0, img.width, img.height).data, hashes = new Uint32Array(img.height);
      for (let y = 0; y < img.height; y++) {
        let h = 2166136261;
        for (let i = y * img.width * 4, e = i + img.width * 4; i < e; i += 4)
          h = Math.imul(h ^ ((d[i] >> 3) | ((d[i + 1] >> 3) << 5) | ((d[i + 2] >> 3) << 10)), 16777619);
        hashes[y] = h >>> 0;
      }
      return { d, hashes, w: img.width, h: img.height };
    };
    const runsOf = (hashes) => {
      const runs = [];
      for (let y = 0; y < hashes.length; y++) {
        const last = runs[runs.length - 1];
        if (last && last.hash === hashes[y]) last.end = y + 1;
        else runs.push({ hash: hashes[y], start: y, end: y + 1 });
      }
      return runs;
    };
    const A = rowsOf(a), B = rowsOf(b), RA = runsOf(A.hashes), RB = runsOf(B.hashes);
    const n = RA.length, m = RB.length, L = new Uint32Array((n + 1) * (m + 1));
    const same = (i, j) => RA[i].hash === RB[j].hash && A.w === B.w;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i * (m + 1) + j] = same(i, j)
        ? L[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
    // What was taken out is ruled only when its rows are nowhere in "after": space that only shrank is not.
    const inAfter = new Set(B.hashes);
    const added = new Uint8Array(B.h), cuts = [];
    const cut = (run, y) => { if (!inAfter.has(run.hash)) cuts.push(y); };
    // A stretch that lined up but changed height is space that grew or shrank, unless its rows carry ink across
    // a good part of the width (5%, more than a card's borders): then it is content, a bar or a button, and its
    // new height is a change.
    const bg = [B.d[0], B.d[1], B.d[2]];
    const isContent = (y) => {
      let inked = 0;
      for (let k = y * B.w * 4, e = k + B.w * 4; k < e; k += 4)
        if (Math.abs(B.d[k] - bg[0]) + Math.abs(B.d[k + 1] - bg[1]) + Math.abs(B.d[k + 2] - bg[2]) > 60) inked++;
      return inked > B.w * 0.05;
    };
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (same(i, j)) {
        const was = RA[i].end - RA[i].start, now = RB[j].end - RB[j].start;
        if (was !== now && isContent(RB[j].start)) {
          if (now > was) added.fill(1, RB[j].start, RB[j].end);
          else cuts.push(RB[j].end);
        }
        i++; j++;
      }
      else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) { cut(RA[i], RB[j].start); i++; }
      else { added.fill(1, RB[j].start, RB[j].end); j++; }
    }
    for (; j < m; j++) added.fill(1, RB[j].start, RB[j].end);
    for (; i < n; i++) cut(RA[i], B.h - 1);
    // What was added is boxed around what differs from the unchanged row next to it (above, or below at the
    // top), not from the background: a card's border runs down both, so it does not stretch the box.
    const boxes = [];
    for (let y = 0; y < B.h; y++) {
      if (!added[y]) continue;
      let y1 = y;
      while (y1 + 1 < B.h && added[y1 + 1]) y1++;
      const ref = y > 0 ? y - 1 : y1 + 1 < B.h ? y1 + 1 : -1;
      const differs = (yy, xx) => {
        const k = (yy * B.w + xx) * 4, r = ref === -1 ? 0 : (ref * B.w + xx) * 4;
        return Math.abs(B.d[k] - B.d[r]) + Math.abs(B.d[k + 1] - B.d[r + 1]) + Math.abs(B.d[k + 2] - B.d[r + 2]) > 60;
      };
      let x0 = B.w, x1 = -1, t = -1, btm = -1;
      for (let yy = y; yy <= y1; yy++)
        for (let xx = 0; xx < B.w; xx++)
          if (differs(yy, xx)) {
            if (xx < x0) x0 = xx;
            if (xx > x1) x1 = xx;
            if (t === -1) t = yy;
            btm = yy;
          }
      if (x1 >= 0 && btm - t >= 2) boxes.push([x0, t, x1 + 1, btm + 1]);
      y = y1;
    }
    // Where something was only taken out, a short rule marks the place it was.
    const rules = [...new Set(cuts)].filter((y) => !added[y] && !added[Math.max(0, y - 1)]);
    x.lineWidth = 6; x.strokeStyle = colour;
    for (const [l, t, r, btm] of boxes) { x.beginPath(); x.roundRect(Math.max(3, l - 8), Math.max(3, t - 8), r - l + 16, btm - t + 16, 12); x.stroke(); }
    x.setLineDash([14, 8]);
    // A little above the line that follows, so the rule sits in the gap rather than on the words.
    for (const y of rules) { const ry = Math.max(4, y - 8); x.beginPath(); x.moveTo(6, ry); x.lineTo(Math.min(b.width - 6, 600), ry); x.stroke(); }
    x.setLineDash([]);
    changed = boxes.length + rules.length;
  }
  // The number is black or white, whichever reads better on the colour.
  const lum = [1, 3, 5]
    .map((k) => parseInt(colour.slice(k, k + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
  const onColour = (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
  const s = scale;
  for (const r of rings) {
    // An ink edge on both sides of the colour, so the ring shows on a light page and a dark one.
    const left = (r.x - 8 + 2) * s, top = (r.y - 8 + 2) * s, w = (r.w + 12) * s, h = (r.h + 12) * s;
    x.lineWidth = 8 * s; x.strokeStyle = '#000000';
    x.beginPath(); x.roundRect(left, top, w, h, 14 * s); x.stroke();
    x.lineWidth = 4 * s; x.strokeStyle = colour;
    x.beginPath(); x.roundRect(left, top, w, h, 14 * s); x.stroke();
    const cx = (r.x - 8 + 1) * s, cy = (r.y - 8 + 1) * s;
    x.beginPath(); x.arc(cx, cy, 15 * s, 0, Math.PI * 2);
    x.fillStyle = colour; x.fill();
    x.lineWidth = 2 * s; x.strokeStyle = '#000000'; x.stroke();
    x.fillStyle = onColour; x.font = `700 ${16 * s}px system-ui, -apple-system, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(r.n), cx, cy + s);
  }
  if (tag) {
    // The tag is SideShot's own and looks the same on every project: the mark (before in paper, after in
    // marigold) and the name, Side in paper and Shot in marigold, on ink, in the bottom right corner.
    // Sized by the picture's pixel density, not its width, so it reads the same on a phone as on a desk.
    const t = scale, pad = 8 * t, sq = 11 * t;
    x.font = `700 ${13 * t}px system-ui, -apple-system, sans-serif`;
    x.textAlign = 'left'; x.textBaseline = 'middle';
    const side = x.measureText('Side').width, shot = x.measureText('Shot').width;
    const w = pad * 2 + sq * 1.7 + 6 * t + side + shot, h = pad * 2 + 13 * t;
    const left = b.width - w - 10 * t, top = b.height - h - 10 * t;
    x.globalAlpha = 0.92; x.fillStyle = '#111111';
    x.beginPath(); x.roundRect(left, top, w, h, 6 * t); x.fill();
    x.globalAlpha = 1;
    const my = top + (h - sq) / 2;
    x.fillStyle = '#f2f2f2'; x.fillRect(left + pad, my, sq, sq);
    x.fillStyle = '#ffc400'; x.fillRect(left + pad + sq * 0.7, my, sq, sq);
    const tx = left + pad + sq * 1.7 + 6 * t;
    x.fillStyle = '#f2f2f2'; x.fillText('Side', tx, top + h / 2 + t);
    x.fillStyle = '#ffc400'; x.fillText('Shot', tx + side, top + h / 2 + t);
  }
  const blob = await c.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return { png: btoa(bin), changed };
}
