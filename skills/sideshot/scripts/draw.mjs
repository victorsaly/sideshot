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
    const pixelsOf = (img) => {
      const oc = new OffscreenCanvas(img.width, img.height), ox = oc.getContext('2d');
      ox.drawImage(img, 0, 0);
      return { d: ox.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };
    const A = pixelsOf(a), B = pixelsOf(b);
    // Columns: where both pictures are background from top to bottom (a gutter between two cards, 16 pixels or
    // wider), each side is compared on its own, so a card that grew does not mark the card beside it. A picture
    // with no such gutter is one column, the whole width, as it always was.
    const columnsOf = () => {
      if (A.w !== B.w) return [[0, B.w]];
      const isBg = (P, k) => Math.abs(P.d[k] - P.d[0]) + Math.abs(P.d[k + 1] - P.d[1]) + Math.abs(P.d[k + 2] - P.d[2]) <= 12;
      const spans = [];
      let from = -1;
      for (let xx = 0; xx <= B.w; xx++) {
        let ink = false;
        if (xx < B.w)
          for (const P of [A, B])
            for (let yy = 0; yy < P.h && !ink; yy++) if (!isBg(P, (yy * P.w + xx) * 4)) ink = true;
        if (ink && from === -1) from = xx;
        if (!ink && from !== -1) { spans.push([from, xx]); from = -1; }
      }
      const cols = [];
      for (const span of spans) {
        const last = cols[cols.length - 1];
        if (last && span[0] - last[1] < 16) last[1] = span[1];
        else cols.push(span);
      }
      return cols.length > 1 ? cols : [[0, B.w]];
    };
    // Within a column, rows are lined up the way a text diff lines up lines, so content that only moved
    // (something above it was added or taken out) is not marked; what was added or changed is boxed, what was
    // taken out is a rule. A stretch of identical rows (blank page, the empty inside of a card) is lined up as
    // one, whatever its height: space that only grew or shrank then lines up with itself, never with content.
    const marksIn = ([x0, x1]) => {
      const cw = x1 - x0;
      const hashesOf = (P) => {
        const hashes = new Uint32Array(P.h);
        for (let y = 0; y < P.h; y++) {
          let h = 2166136261;
          for (let i = (y * P.w + x0) * 4, e = i + cw * 4; i < e; i += 4)
            h = Math.imul(h ^ ((P.d[i] >> 3) | ((P.d[i + 1] >> 3) << 5) | ((P.d[i + 2] >> 3) << 10)), 16777619);
          hashes[y] = h >>> 0;
        }
        return hashes;
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
      const HA = hashesOf(A), HB = hashesOf(B), RA = runsOf(HA), RB = runsOf(HB);
      const n = RA.length, m = RB.length, L = new Uint32Array((n + 1) * (m + 1));
      const same = (i, j) => RA[i].hash === RB[j].hash && A.w === B.w;
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
        L[i * (m + 1) + j] = same(i, j)
          ? L[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
      // A row is content when it carries ink, against the picture's background, across a good part of the
      // column (5%, more than a card's borders); otherwise it is space: blank page, the empty inside of a card.
      const isContent = (P, y) => {
        let inked = 0;
        for (let k = (y * P.w + x0) * 4, e = k + cw * 4; k < e; k += 4)
          if (Math.abs(P.d[k] - P.d[0]) + Math.abs(P.d[k + 1] - P.d[1]) + Math.abs(P.d[k + 2] - P.d[2]) > 60) inked++;
        return inked > cw * 0.05;
      };
      // What was taken out is ruled when it was content, even if like rows still show elsewhere (one of two like
      // blocks), or when its rows are nowhere in "after"; space that only shrank is not.
      const inAfter = new Set(HB);
      const added = new Uint8Array(B.h), cuts = [];
      const cut = (run, y) => { if (isContent(A, run.start) || !inAfter.has(run.hash)) cuts.push({ y, run }); };
      // Where each row of "after" was in "before", as rows to add: known where rows lined up, and for what did
      // not, taken from the nearest row above that did.
      const toA = new Float64Array(B.h).fill(NaN);
      // A stretch that lined up but changed height is space that grew or shrank, unless it is content, a bar or
      // a button: then its new height is a change. Not by 2 pixels or less, though: a page's lines sit at
      // fractional heights, each drawn at the nearest whole pixel, so when something above them moves, each can
      // land a pixel higher or lower than it was, and the space between two of them grow or shrink by up to 2.
      // Beside a gutter that runs down every row (a diff's + column), that space reads as content.
      const rounding = 2;
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (same(i, j)) {
          const was = RA[i].end - RA[i].start, now = RB[j].end - RB[j].start;
          toA.fill(RA[i].start - RB[j].start, RB[j].start, RB[j].end);
          if (Math.abs(now - was) > rounding && isContent(B, RB[j].start)) {
            if (now > was) added.fill(1, RB[j].start, RB[j].end);
            else cuts.push({ y: RB[j].end, run: null });
          }
          i++; j++;
        }
        else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) { cut(RA[i], RB[j].start); i++; }
        else { added.fill(1, RB[j].start, RB[j].end); j++; }
      }
      for (; j < m; j++) added.fill(1, RB[j].start, RB[j].end);
      for (; i < n; i++) cut(RA[i], B.h - 1);
      let known = toA.find((d) => !Number.isNaN(d)) ?? 0;
      for (let y = 0; y < B.h; y++) if (Number.isNaN(toA[y])) toA[y] = known; else known = toA[y];
      // What only moved by rounding, a label a pixel or two higher in a button that did not move, its icon and its
      // words each rounded on their own, lines up with no row; yet every pixel of it is still there, within two
      // pixels of where it was, and every pixel that was there is still near. Both ways, so a mark that turned into
      // another in the same place (an upright stroke, now a flat one) is not taken for one that moved.
      const near = 2, allowed = 4;
      const stillNear = (P, Q, l, t, r, btm, dy) => {
        let missing = 0;
        for (let y = t; y < btm; y++)
          for (let xx = l; xx < r; xx++) {
            const k = (y * P.w + xx) * 4;
            let found = false;
            for (let ddy = -near; ddy <= near && !found; ddy++) {
              const qy = y + dy + ddy;
              if (qy < 0 || qy >= Q.h) continue;
              for (let ddx = -near; ddx <= near && !found; ddx++) {
                const qx = xx + ddx;
                if (qx < 0 || qx >= Q.w) continue;
                const q = (qy * Q.w + qx) * 4;
                found = Math.abs(P.d[k] - Q.d[q]) + Math.abs(P.d[k + 1] - Q.d[q + 1]) + Math.abs(P.d[k + 2] - Q.d[q + 2]) <= 48;
              }
            }
            if (!found && ++missing > allowed) return false;
          }
        return true;
      };
      // What is in "after" is looked for where the mark is; what was in "before", across the whole column of those
      // rows, since what was taken out may lie outside it (a block that only got narrower). A stretch that does
      // not fit in both pictures is not checked by halves: it is marked.
      const onlyMoved = (l, t, r, btm, dy) =>
        t >= 0 && btm <= B.h && t + dy >= 0 && btm + dy <= A.h &&
        stillNear(B, A, l, t, r, btm, dy) && stillNear(A, B, x0, t + dy, x1, btm + dy, -dy);
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
        let bx0 = x1, bx1 = -1, t = -1, btm = -1;
        for (let yy = y; yy <= y1; yy++)
          for (let xx = x0; xx < x1; xx++)
            if (differs(yy, xx)) {
              if (xx < bx0) bx0 = xx;
              if (xx > bx1) bx1 = xx;
              if (t === -1) t = yy;
              btm = yy;
            }
        if (bx1 >= 0 && btm - t >= 2 && !onlyMoved(bx0, t, bx1 + 1, btm + 1, toA[t])) boxes.push([bx0, t, bx1 + 1, btm + 1]);
        y = y1;
      }
      // Where something was only taken out, a short rule marks the place it was, within the column: inset by
      // less in a narrow column, and never shorter than 12 pixels, so a thin thing taken out still shows. Not
      // where what was taken out is still there, a pixel or two away.
      // The rows taken out at each place, or none when it is a block that only got shorter (always ruled).
      const ruledAt = new Map();
      for (const { y, run } of cuts) {
        const at = ruledAt.get(y) ?? { runs: [], shrank: false };
        if (run) at.runs.push(run);
        else at.shrank = true;
        ruledAt.set(y, at);
      }
      const rules = [...ruledAt]
        .filter(([y]) => !added[y] && !added[Math.max(0, y - 1)])
        .filter(([y, { runs, shrank }]) => {
          if (shrank) return true;
          const t = Math.min(...runs.map((r) => r.start)), btm = Math.max(...runs.map((r) => r.end));
          return !onlyMoved(x0, y, x1, y + btm - t, t - y);
        })
        .map(([y]) => y);
      const inset = Math.min(6, Math.floor(cw / 4));
      return {
        boxes,
        rules: rules.map((y) => [y, x0 + inset, Math.max(x0 + inset + 12, Math.min(x1 - inset, x0 + 600))]),
      };
    };
    const marks = columnsOf().map(marksIn);
    const boxes = marks.flatMap((mk) => mk.boxes), rules = marks.flatMap((mk) => mk.rules);
    x.lineWidth = 6; x.strokeStyle = colour;
    for (const [l, t, r, btm] of boxes) { x.beginPath(); x.roundRect(Math.max(3, l - 8), Math.max(3, t - 8), r - l + 16, btm - t + 16, 12); x.stroke(); }
    x.setLineDash([14, 8]);
    // A little above the line that follows, so the rule sits in the gap rather than on the words.
    for (const [y, from, to] of rules) { const ry = Math.max(4, y - 8); x.beginPath(); x.moveTo(from, ry); x.lineTo(Math.min(b.width - 6, to), ry); x.stroke(); }
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

/** Runs in the page: one sheet of pairs, each before beside after, small, with what it is said above it. Made to
 * be looked over in one go, by a person or an agent, before anything is published; never published itself. */
export async function sheet({ rows }) {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const W = 1400, gap = 16, band = 30, col = (W - 3 * gap) / 2, tallest = 440;
  const laid = [];
  for (const r of rows) {
    const before = r.before ? await load(r.before) : null, after = r.after ? await load(r.after) : null;
    const shown = [before, after].filter(Boolean);
    // Both sides at one scale, so a part that grew looks bigger.
    const s = Math.min(1, col / Math.max(...shown.map((i) => i.width)), tallest / Math.max(...shown.map((i) => i.height)));
    laid.push({ label: r.label, before, after, s, h: Math.max(...shown.map((i) => i.height)) * s });
  }
  const H = gap + laid.reduce((sum, r) => sum + band + r.h + gap, 0);
  const c = new OffscreenCanvas(W, Math.ceil(H)), x = c.getContext('2d');
  x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, W, H);
  let y = gap;
  for (const r of laid) {
    x.fillStyle = '#111111'; x.font = '600 17px system-ui, -apple-system, sans-serif'; x.textBaseline = 'middle';
    x.textAlign = 'left'; x.fillText(r.label, gap, y + band / 2);
    x.font = '15px system-ui, -apple-system, sans-serif'; x.fillStyle = '#555555';
    x.textAlign = 'right'; x.fillText('before', gap + col, y + band / 2); x.fillText('after', W - gap, y + band / 2);
    x.textAlign = 'left';
    [r.before, r.after].forEach((img, k) => {
      const left = gap + k * (col + gap), top = y + band;
      if (!img) { x.fillStyle = '#555555'; x.fillText('(not there)', left + 8, top + 20); return; }
      const w = img.width * r.s, h = img.height * r.s;
      x.drawImage(img, left, top, w, h);
      x.strokeStyle = '#999999'; x.lineWidth = 1; x.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
    });
    y += band + r.h + gap;
  }
  const blob = await c.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(bin);
}
