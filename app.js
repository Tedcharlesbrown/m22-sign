'use strict';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '1234567890'.split('');
const SYMBOLS = [',', '.', '-', '/', ':', '!', '?', '&', '%', ';', '"', '$', '@'];
const CHARS = [...LETTERS, ...DIGITS, ...SYMBOLS];
const CHARSET = new Set(CHARS);
const SILENT_CHARS = new Set(["'", '’', '‘']);
const PREVIEW_ROWS = 4;
const PREVIEW_COLS = 17;
const PREVIEW_CELLS = PREVIEW_ROWS * PREVIEW_COLS;
const BONUS_COUNTS = { dl: 5, tl: 2, dw: 3, tw: 1 };
const BONUS_LABELS = { dl: 'DL', tl: 'TL', dw: 'DW', tw: 'TW' };
const TILE_EQUIV = { 9: '6', '-': 'I', '/': 'I' };
const TILE_POOL_LABEL = { 6: '6/9', I: 'I or /' };
const VALUES = {
	A: 1,
	B: 3,
	C: 3,
	D: 2,
	E: 1,
	F: 4,
	G: 2,
	H: 4,
	I: 1,
	J: 8,
	K: 5,
	L: 1,
	M: 3,
	N: 1,
	O: 1,
	P: 3,
	Q: 10,
	R: 1,
	S: 1,
	T: 1,
	U: 1,
	V: 4,
	W: 4,
	X: 8,
	Y: 4,
	Z: 10,
	0: 1,
	1: 1,
	2: 1,
	3: 1,
	4: 1,
	5: 1,
	6: 1,
	7: 1,
	8: 1,
	9: 1,
	',': 1,
	'.': 1,
	'-': 1,
	'/': 1,
	':': 1,
	'!': 1,
	'?': 1,
	'&': 2,
	'%': 2,
	';': 1,
	'"': 1,
	'$': 2,
	'@': 2,
};

const SIGNS = [
	{ key: 'M22N', label: 'M22 North' },
	{ key: 'M22S', label: 'M22 South' },
];

// Original tile counts, loaded from inventory.json at startup (see loadDefaultInv).
let DEFAULT_INV = {};

async function loadDefaultInv() {
	try {
		const res = await fetch('inventory.json', { cache: 'no-cache' });
		if (!res.ok) throw new Error('inventory.json request failed');
		const data = await res.json();
		if (data && typeof data === 'object') {
			const next = {};
			for (const ch of CHARS) {
				const n = parseInt(data[ch], 10);
				next[ch] = isNaN(n) || n < 0 ? 0 : n;
			}
			DEFAULT_INV = next;
		}
	} catch (e) {
		console.warn('Could not load inventory.json; defaulting to empty inventory.', e);
	}
}

const STORE_KEY = 'signswap.v2';

let state = { inv: {}, text: {}, preview: {}, highScore: 0 };
let currentShortSet = new Set();

function loadState() {
	try {
		const r = localStorage.getItem(STORE_KEY);
		if (r) {
			const s = JSON.parse(r);
			if (s && typeof s === 'object') return s;
		}
	} catch (e) {}
	return null;
}
function saveState() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(state));
	} catch (e) {}
}
let calculateTimer = 0;
let saveTimer = 0;
function scheduleCalculate(delay) {
	clearTimeout(calculateTimer);
	calculateTimer = setTimeout(calculate, delay == null ? 90 : delay);
}
function scheduleSaveState(delay) {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(saveState, delay == null ? 160 : delay);
}

function inv() {
	for (const c of CHARS) if (!(c in state.inv)) state.inv[c] = DEFAULT_INV[c] || 0;
	return state.inv;
}
function txt(key) {
	if (!state.text[key]) state.text[key] = { now: '', next: '' };
	return state.text[key];
}

/* tiles */
function tileEl(ch, cls) {
	const t = document.createElement('span');
	t.className = 'tile' + (cls ? ' ' + cls : '');
	t.textContent = ch;
	const v = VALUES[ch];
	if (v) {
		const s = document.createElement('span');
		s.className = 'val';
		s.textContent = v;
		t.appendChild(s);
	}
	return t;
}
function tileCount(ch, n, short) {
	const box = document.createElement('span');
	box.className = 'tilebox' + (short ? ' short' : '');
	box.appendChild(tileEl(ch));
	const b = document.createElement('span');
	b.className = 'badge';
	b.textContent = '×' + n;
	box.appendChild(b);
	return box;
}
function fillTiles(el, map, shortInfo) {
	el.innerHTML = '';
	let any = false;
	const missing = {};
	const remainingShort = new Map();
	if (shortInfo instanceof Map) {
		for (const [key, info] of shortInfo) remainingShort.set(key, info.need || 0);
	}
	for (const ch of CHARS) {
		const n = map[ch] || 0;
		if (n > 0) {
			const info = shortInfo instanceof Map ? shortInfo.get(tileKey(ch)) : null;
			if (info) {
				const key = tileKey(ch);
				const missingCount = Math.min(n, remainingShort.get(key) || 0);
				remainingShort.set(key, Math.max(0, (remainingShort.get(key) || 0) - missingCount));
				const haveCount = Math.max(0, n - missingCount);
				if (haveCount > 0) {
					el.appendChild(tileCount(ch, haveCount, false));
					any = true;
				}
				if (missingCount > 0) {
					missing[ch] = (missing[ch] || 0) + missingCount;
					any = true;
				}
			} else {
				el.appendChild(tileCount(ch, n, shortInfo && shortInfo.has && shortInfo.has(ch)));
				any = true;
			}
		}
	}
	for (const ch of CHARS) {
		const n = missing[ch] || 0;
		if (n > 0) {
			el.appendChild(tileCount(ch, n, true));
		}
	}
	return any;
}
function hasTiles(map) {
	for (const ch of CHARS) if ((map[ch] || 0) > 0) return true;
	return false;
}
function tileKey(ch) {
	return TILE_EQUIV[ch] || ch;
}
function tilePoolLabel(key) {
	return TILE_POOL_LABEL[key] || key;
}
function addPoolCount(out, ch, n) {
	if (n > 0) {
		const key = tileKey(ch);
		out[key] = (out[key] || 0) + n;
	}
}
function poolCounts(map) {
	const out = {};
	for (const ch of CHARS) addPoolCount(out, ch, map[ch] || 0);
	return out;
}
function normalizeBonusBoard(raw) {
	const valid = new Set(Object.keys(BONUS_LABELS));
	const board = Array.isArray(raw) ? raw.slice(0, PREVIEW_CELLS) : [];
	while (board.length < PREVIEW_CELLS) board.push('');
	return board.map((bonus, i) => (i > 0 && valid.has(bonus) ? bonus : ''));
}
function makeSeed() {
	return Math.floor(Math.random() * 0x100000000) >>> 0;
}
function localDateKey(d) {
	const date = d || new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}
function seededRandom(seed) {
	let n = seed >>> 0;
	return () => {
		n = (n + 0x6d2b79f5) >>> 0;
		let t = n;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function randomBonusBoard(seed) {
	const rand = seededRandom(seed || makeSeed());
	const bonuses = [];
	for (const bonus of ['dl', 'dw', 'tl', 'tw']) {
		for (let i = 0; i < BONUS_COUNTS[bonus]; i++) bonuses.push(bonus);
	}
	for (let boardAttempt = 0; boardAttempt < 100; boardAttempt++) {
		const board = Array(PREVIEW_CELLS).fill('');
		const shuffled = bonuses.slice();
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		const placed = [];
		let complete = true;
		for (const bonus of shuffled) {
			let picked = -1;
			for (let attempts = 0; attempts < 400 && picked < 0; attempts++) {
				const idx = 1 + Math.floor(rand() * (PREVIEW_CELLS - 1));
				const row = Math.floor(idx / PREVIEW_COLS);
				const col = idx % PREVIEW_COLS;
				if (board[idx]) continue;
				if (
					placed.some(
						(spot) => spot.col === col || (spot.row === row && Math.abs(spot.col - col) <= 4)
					)
				)
					continue;
				picked = idx;
			}
			if (picked < 0) {
				complete = false;
				break;
			}
			board[picked] = bonus;
			placed.push({ row: Math.floor(picked / PREVIEW_COLS), col: picked % PREVIEW_COLS });
		}
		if (complete) return board;
	}
	return Array(PREVIEW_CELLS).fill('');
}
function previewKey(signKey, field) {
	return signKey + ':' + field;
}
function normalizePreviewMeta(raw) {
	const seed = Number.isInteger(raw && raw.bonusSeed) ? raw.bonusSeed >>> 0 : makeSeed();
	const bonuses = normalizeBonusBoard(raw && raw.bonuses);
	return {
		bonusSeed: seed,
		bonuses: bonuses.some(Boolean) ? bonuses : randomBonusBoard(seed),
		score: Math.max(0, parseInt(raw && raw.score, 10) || 0),
		dateKey: typeof (raw && raw.dateKey) === 'string' ? raw.dateKey : localDateKey(),
	};
}
function ensurePreviewMeta(signKey, field) {
	if (!state.preview || typeof state.preview !== 'object') state.preview = {};
	const key = previewKey(signKey, field);
	state.preview[key] = normalizePreviewMeta(state.preview[key]);
	return state.preview[key];
}
function updateHighScoreBadge(isNew) {
	const el = document.getElementById('highScoreBadge');
	if (!el) return;
	el.textContent = 'High score: ' + (state.highScore || 0);
	if (isNew) {
		el.classList.remove('new');
		void el.offsetWidth;
		el.classList.add('new');
	}
}
function commitHighScore(score) {
	const n = Math.max(0, parseInt(score, 10) || 0);
	if (n <= (state.highScore || 0)) return false;
	state.highScore = n;
	updateHighScoreBadge(true);
	return true;
}
function clearHighScore() {
	state.highScore = 0;
	updateHighScoreBadge(false);
	saveState();
}
function randomizePreviewBonuses() {
	for (const sign of SIGNS) {
		for (const field of ['now', 'next']) {
			const meta = ensurePreviewMeta(sign.key, field);
			meta.bonusSeed = makeSeed();
			meta.bonuses = randomBonusBoard(meta.bonusSeed);
			meta.dateKey = localDateKey();
		}
	}
	calculate();
	saveState();
}
function rotateNextPreviewBonusesIfNeeded() {
	const today = localDateKey();
	let changed = false;
	for (const sign of SIGNS) {
		const meta = ensurePreviewMeta(sign.key, 'next');
		if (meta.dateKey === today) continue;
		meta.bonusSeed = makeSeed();
		meta.bonuses = randomBonusBoard(meta.bonusSeed);
		meta.score = 0;
		meta.dateKey = today;
		changed = true;
	}
	if (changed) saveState();
}
function scheduleNextBonusRotation() {
	const now = new Date();
	const next = new Date(now);
	next.setHours(24, 0, 1, 0);
	setTimeout(() => {
		rotateNextPreviewBonusesIfNeeded();
		calculate();
		scheduleNextBonusRotation();
	}, Math.max(1000, next.getTime() - now.getTime()));
}
function fillTilePreview(el, text, shortSet, animate, meta) {
	el.innerHTML = '';
	const bonuses = normalizeBonusBoard(meta && meta.bonuses);
	const lines = previewLines(text);
	const rows = [];
	function bonusFor(row, col) {
		if (col >= PREVIEW_COLS) return '';
		return bonuses[row * PREVIEW_COLS + col] || '';
	}
	function makeHole(rowIndex, colIndex) {
		const hole = document.createElement('span');
		hole.className = 'previewhole';
		if (rowIndex === 0 && colIndex === 0) hole.classList.add('star');
		const bonus = bonusFor(rowIndex, colIndex);
		if (bonus) {
			hole.classList.add('bonus', bonus);
			hole.dataset.bonus = BONUS_LABELS[bonus];
		}
		hole.style.setProperty('--preview-row', rowIndex);
		hole.style.setProperty('--preview-col', colIndex);
		return hole;
	}
	function ensureCell(rowIndex, colIndex) {
		if (rowIndex >= PREVIEW_ROWS) return null;
		const row = rows[rowIndex];
		while (row.children.length <= colIndex) {
			row.appendChild(makeHole(rowIndex, row.children.length));
		}
		return row.children[colIndex];
	}
	for (let r = 0; r < PREVIEW_ROWS; r++) {
		const row = document.createElement('div');
		row.className = 'previewline';
		for (let c = 0; c < PREVIEW_COLS; c++) {
			row.appendChild(makeHole(r, c));
		}
		rows.push(row);
		el.appendChild(row);
	}
	let score = 0;
	let wordScore = 0;
	let wordMultiplier = 1;
	let lastTile = null;
	const placedTiles = [];
	let rowIdx = 0;
	let colIdx = 0;
	function nextCell() {
		colIdx++;
	}
	function nextRow() {
		rowIdx++;
		colIdx = 0;
	}
	function finishWord() {
		score += wordScore * wordMultiplier;
		wordScore = 0;
		wordMultiplier = 1;
	}
	function placeTile(ch) {
		if (rowIdx >= PREVIEW_ROWS) return false;
		const cell = ensureCell(rowIdx, colIdx);
		if (!cell) return false;
		const tile = tileEl(ch, shortSet && shortSet.has(ch) ? 'short' : '');
		const bonus = rowIdx === 0 && colIdx === 0 ? 'dw' : bonusFor(rowIdx, colIdx);
		cell.appendChild(tile);
		const value = VALUES[ch] || 0;
		const letterMultiplier = bonus === 'dl' ? 2 : bonus === 'tl' ? 3 : 1;
		if (bonus === 'dw') wordMultiplier *= 2;
		if (bonus === 'tw') wordMultiplier *= 3;
		wordScore += value * letterMultiplier;
		lastTile = tile;
		placedTiles.push({ tile, row: rowIdx, col: colIdx });
		nextCell();
		return true;
	}
	for (const line of lines) {
		const parts = line.split(/(\s+)/);
		for (const part of parts) {
			if (!part) continue;
			if (/^\s+$/.test(part)) {
				finishWord();
				for (let i = 0; i < part.length && rowIdx < PREVIEW_ROWS; i++) {
					nextCell();
				}
				continue;
			}
			const chars = [...part].filter((ch) => CHARSET.has(ch));
			if (!chars.length) continue;
			for (const ch of chars) {
				if (!placeTile(ch)) break;
			}
		}
		finishWord();
		if (rowIdx >= PREVIEW_ROWS) break;
		nextRow();
	}
	finishWord();
	const totalScore = score;
	if (meta) meta.score = totalScore;
	const foot = document.createElement('div');
	foot.className = 'previewscore';
	foot.textContent = 'Total score: ' + totalScore;
	el.appendChild(foot);
	if (animate === 'all' || animate === 'paste') {
		const delayStep = animate === 'paste' ? 32 : 12;
		const maxDelay = animate === 'paste' ? 520 : 180;
		const duration = animate === 'paste' ? '280ms' : '';
		placedTiles.forEach(({ tile, col }) => {
			tile.style.animationDelay = Math.min(col * delayStep, maxDelay) + 'ms';
			if (duration) tile.style.animationDuration = duration;
			tile.classList.add('slam');
		});
	} else if (animate && lastTile) {
		lastTile.classList.add('slam');
	}
}
function previewLines(text) {
	const lines = [];
	let line = '';
	for (const ch of String(text || '').toUpperCase()) {
		if (ch === '\r') continue;
		if (ch === '\n') {
			lines.push(line);
			if (lines.length >= PREVIEW_ROWS) return lines;
			line = '';
		} else {
			line += ch;
		}
	}
	lines.push(line);
	return lines;
}
function renderInputPreview(preview, text, signKey, field, animate) {
	const meta = ensurePreviewMeta(signKey, field);
	const shortSet = field === 'next' ? currentShortSet : null;
	const shortSig = shortSet ? [...shortSet].join('') : '';
	fillTilePreview(preview, text, shortSet, animate, meta);
	preview.dataset.renderText = text;
	preview.dataset.renderShortSig = shortSig;
	preview.dataset.renderBonusSig = String(meta.bonusSeed || '');
}

/* counting */
function countText(text, counts, unknown) {
	for (const ch of (text || '').toUpperCase()) {
		if (CHARSET.has(ch)) counts[ch] = (counts[ch] || 0) + 1;
		else if (ch.trim() !== '' && !SILENT_CHARS.has(ch)) unknown.add(ch);
	}
}

/* build header wordmark */
function buildWordmark() {
	const map = { wm1: 'SIGN', wm2: 'SWAP' };
	for (const id in map) {
		const el = document.getElementById(id);
		el.innerHTML = '';
		for (const ch of map[id]) el.appendChild(tileEl(ch, 'head'));
	}
}

/* build sign inputs */
function buildEntry() {
	const wrap = document.getElementById('entry');
	wrap.innerHTML = '';
	const head = document.createElement('div');
	head.className = 'entry-head';
	const title = document.createElement('h2');
	title.textContent = 'Signs';
	const actions = document.createElement('div');
	actions.className = 'entry-actions';
	const promote = document.createElement('button');
	promote.type = 'button';
	promote.className = 'ghost';
	promote.id = 'promoteBtn';
	promote.textContent = 'Next Sign';
	const print = document.createElement('button');
	print.type = 'button';
	print.className = 'ghost';
	print.id = 'printBtn';
	print.textContent = 'Print';
	const load = document.createElement('button');
	load.type = 'button';
	load.className = 'ghost';
	load.id = 'loadBtn';
	load.textContent = 'Load';
	const save = document.createElement('button');
	save.type = 'button';
	save.className = 'ghost save-action';
	save.id = 'saveBtn';
	save.textContent = 'Save';
	const loadInput = document.createElement('input');
	loadInput.type = 'file';
	loadInput.id = 'loadInput';
	loadInput.accept = '.json,application/json';
	loadInput.hidden = true;
	actions.appendChild(print);
	actions.appendChild(load);
	actions.appendChild(save);
	actions.appendChild(promote);
	actions.appendChild(loadInput);
	head.appendChild(title);
	head.appendChild(actions);
	wrap.appendChild(head);
	for (const sign of SIGNS) {
		const t = txt(sign.key);
		const block = document.createElement('div');
		block.className = 'signinput';
		const h = document.createElement('h3');
		h.className = 'signname';
		h.textContent = sign.label;
		block.appendChild(h);
		const g = document.createElement('div');
		g.className = 'grid2';

		g.appendChild(ioCol('On the sign now', 'now', sign.key, 'now', t.now));
		g.appendChild(ioCol('Up Next', 'next', sign.key, 'next', t.next));
		block.appendChild(g);
		wrap.appendChild(block);
	}
	const alertSlot = document.createElement('div');
	alertSlot.id = 'alertSlot';
	alertSlot.className = 'input-alert-slot';
	wrap.appendChild(alertSlot);
	const noteSlot = document.createElement('div');
	noteSlot.id = 'noteSlot';
	wrap.appendChild(noteSlot);
	const loadStatus = document.createElement('div');
	loadStatus.id = 'loadStatus';
	loadStatus.className = 'loadstatus';
	wrap.appendChild(loadStatus);
}
function ioCol(label, cls, signKey, field, val) {
	const col = document.createElement('div');
	const l = document.createElement('div');
	l.className = 'iolab ' + cls;
	l.textContent = label;
	const ta = document.createElement('textarea');
	ta.value = val || '';
	ta.spellcheck = true;
	ta.setAttribute('aria-label', signKey + ' ' + label);
	ta.setAttribute('spellcheck', 'true');
	const preview = document.createElement('div');
	preview.className = 'tilepreview';
	preview.setAttribute('aria-hidden', 'true');
	preview.dataset.signKey = signKey;
	preview.dataset.field = field;
	fillTilePreview(preview, ta.value, null, false, ensurePreviewMeta(signKey, field));
	ta.addEventListener('focus', warmAudio);
	ta.addEventListener('pointerdown', warmAudio);
	ta.addEventListener('input', () => {
		txt(signKey)[field] = ta.value;
		if (!preview.dataset.animateNext) preview.dataset.animateNext = '1';
		const animate = preview.dataset.animateNext;
		delete preview.dataset.animateNext;
		renderInputPreview(preview, ta.value, signKey, field, animate);
		scheduleCalculate();
		scheduleSaveState();
	});
	ta.addEventListener('keydown', playTileSound);
	ta.addEventListener('cut', (e) => {
		handleCut(e, ta, preview, signKey, field);
	});
	ta.addEventListener('paste', (e) => {
		preview.dataset.animateNext = 'paste';
		playPasteSound(e);
	});
	col.appendChild(l);
	col.appendChild(ta);
	col.appendChild(preview);
	return col;
}
let audioCtx = null;
function warmAudio() {
	try {
		audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
		if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
	} catch (e) {}
}
function playTileSound(e) {
	const key = e && typeof e === 'object' ? e.key : e;
	if (e && typeof e === 'object' && (e.metaKey || e.ctrlKey || e.altKey)) return;
	const isTileKey = typeof key === 'string' && key.length === 1 && CHARSET.has(key.toUpperCase());
	const isEditKey = key === 'Backspace' || key === 'Delete';
	if (!isTileKey && !isEditKey) return;
	playTileClacks(1);
}
function playPasteSound(e) {
	const pasted = e.clipboardData ? e.clipboardData.getData('text') : '';
	playTextChangeSound(pasted);
}
function playTextChangeSound(text) {
	let tiles = 0;
	for (const ch of String(text || '').toUpperCase()) {
		if (CHARSET.has(ch)) tiles++;
	}
	playTileClacks(Math.min(12, Math.max(2, Math.ceil(tiles / 3))));
}
function handleCut(e, ta, preview, signKey, field) {
	const start = ta.selectionStart || 0;
	const end = ta.selectionEnd || 0;
	if (start === end) return;
	const text = ta.value;
	const cut = text.slice(start, end);
	playTextChangeSound(cut);
	if (e.clipboardData) {
		e.preventDefault();
		e.clipboardData.setData('text/plain', cut);
		animateCutSelection(preview, text, start, end);
		setTimeout(() => {
			ta.value = text.slice(0, start) + text.slice(end);
			ta.setSelectionRange(start, start);
			txt(signKey)[field] = ta.value;
			scheduleCalculate(0);
			scheduleSaveState(0);
		}, 620);
	}
}
function animateCutSelection(preview, text, start, end) {
	for (const pos of previewPositionsForRange(text, start, end)) {
		const row = preview.querySelectorAll('.previewline')[pos.row];
		const tile = row && row.children[pos.col] && row.children[pos.col].querySelector('.tile');
		if (!tile) continue;
		tile.style.animationDelay = Math.min(pos.col * 32, 520) + 'ms';
		tile.style.animationDuration = '280ms';
		tile.classList.add('cutout');
	}
}
function previewPositionsForRange(text, start, end) {
	const out = [];
	let row = 0;
	let col = 0;
	for (let i = 0; i < text.length && row < PREVIEW_ROWS; i++) {
		const ch = text[i].toUpperCase();
		if (ch === '\n') {
			row++;
			col = 0;
			continue;
		}
		if (/\s/.test(ch)) {
			col++;
			continue;
		}
		if (!CHARSET.has(ch)) continue;
		if (i >= start && i < end) out.push({ row, col });
		col++;
	}
	return out;
}
function playTileClacks(count) {
	try {
		audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
		const play = () => {
			for (let i = 0; i < count; i++) {
				setTimeout(playTileClack, i * 45);
			}
		};
		if (audioCtx.state === 'suspended') {
			audioCtx
				.resume()
				.then(play)
				.catch(() => {});
			return;
		}
		play();
	} catch (e) {}
}
function playTileClack() {
	const now = audioCtx.currentTime + 0.001;
	try {
		const master = audioCtx.createGain();
		master.gain.setValueAtTime(2.8, now);
		master.connect(audioCtx.destination);
		const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.035, audioCtx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
		const noise = audioCtx.createBufferSource();
		const noiseGain = audioCtx.createGain();
		const noiseFilter = audioCtx.createBiquadFilter();
		noise.buffer = buffer;
		noiseFilter.type = 'bandpass';
		noiseFilter.frequency.setValueAtTime(3400 + Math.random() * 900, now);
		noiseFilter.Q.setValueAtTime(1.7, now);
		noiseGain.gain.setValueAtTime(0.0001, now);
		noiseGain.gain.exponentialRampToValueAtTime(0.18, now + 0.002);
		noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
		noise.connect(noiseFilter);
		noiseFilter.connect(noiseGain);
		noiseGain.connect(master);
		noise.start(now);
		noise.stop(now + 0.03);

		for (const offset of [0, 0.012]) {
			const click = audioCtx.createOscillator();
			const clickGain = audioCtx.createGain();
			const clickFilter = audioCtx.createBiquadFilter();
			const t = now + offset;
			click.type = 'triangle';
			click.frequency.setValueAtTime(2350 + Math.random() * 750, t);
			clickFilter.type = 'bandpass';
			clickFilter.frequency.setValueAtTime(3300 + Math.random() * 700, t);
			clickFilter.Q.setValueAtTime(2.6, t);
			clickGain.gain.setValueAtTime(0.0001, t);
			clickGain.gain.exponentialRampToValueAtTime(offset ? 0.09 : 0.13, t + 0.002);
			clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
			click.connect(clickFilter);
			clickFilter.connect(clickGain);
			clickGain.connect(master);
			click.start(t);
			click.stop(t + 0.022);
		}
	} catch (e) {}
}

/* inventory editor */
function buildInv() {
	const grid = document.getElementById('invGrid');
	grid.innerHTML = '';
	const I = inv();
	for (const ch of CHARS) {
		const cell = document.createElement('div');
		cell.className = 'invcell';
		const tile = tileEl(ch, 'scrabble');
		const i = document.createElement('input');
		i.type = 'text';
		i.inputMode = 'numeric';
		i.value = I[ch] || 0;
		i.addEventListener('input', () => {
			let n = parseInt(i.value, 10);
			if (isNaN(n) || n < 0) n = 0;
			I[ch] = n;
			saveState();
			calculate();
		});
		cell.appendChild(tile);
		cell.appendChild(i);
		grid.appendChild(cell);
	}
}

/* main calculation (live) */
function calculate() {
	const I = inv();
	const unknown = new Set();
	const adds = {}; // aggregate put-up letters across signs
	const removes = {}; // aggregate take-down letters across signs
	const current = {}; // total now across signs
	const stays = {}; // letters that stay on the same sign
	const bring = {}; // letters that must come from the box
	const swap = {}; // letters reused from another sign
	const deployed = {}; // total next across signs
	const perSign = []; // {label, take:{}, put:{}, swap:{}}

	for (const sign of SIGNS) {
		const t = txt(sign.key);
		const now = {},
			next = {};
		countText(t.now, now, unknown);
		countText(t.next, next, unknown);
		const take = {},
			put = {};
		for (const ch of CHARS) {
			const c = now[ch] || 0,
				n = next[ch] || 0;
			const d = n - c;
			if (c > 0) current[ch] = (current[ch] || 0) + c;
			if (c > 0 && n > 0) stays[ch] = (stays[ch] || 0) + Math.min(c, n);
			if (d > 0) {
				put[ch] = d;
				adds[ch] = (adds[ch] || 0) + d;
			}
			if (d < 0) {
				take[ch] = -d;
				removes[ch] = (removes[ch] || 0) + -d;
			}
			if (n > 0) deployed[ch] = (deployed[ch] || 0) + n;
		}
		perSign.push({ label: sign.label, take, put, swap: {} });
	}

	const poolInv = poolCounts(I);
	const poolRemoves = poolCounts(removes);
	const poolCurrent = poolCounts(current);
	const poolStays = poolCounts(stays);
	const poolDeployed = poolCounts(deployed);

	const poolSwapUsed = {};
	for (const ch of CHARS) {
		const key = tileKey(ch);
		const transferable = poolRemoves[key] || 0;
		const availableForPool = Math.max(0, transferable - (poolSwapUsed[key] || 0));
		const pooledMoved = Math.min(adds[ch] || 0, availableForPool);
		if (pooledMoved > 0) {
			swap[ch] = pooledMoved;
			poolSwapUsed[key] = (poolSwapUsed[key] || 0) + pooledMoved;
		}
		const fromBox = (adds[ch] || 0) - pooledMoved;
		if (fromBox > 0) bring[ch] = fromBox;
	}
	const poolBring = poolCounts(bring);
	const remainingSwap = Object.assign({}, swap);
	for (const s of perSign) {
		for (const ch of CHARS) {
			const n = Math.min(s.put[ch] || 0, remainingSwap[ch] || 0);
			if (n > 0) {
				s.swap[ch] = n;
				remainingSwap[ch] -= n;
			}
		}
	}

	// shortages: the box cannot provide enough of the tiles that must be brought
	const shortSet = new Set();
	const shortInfo = new Map();
	const shortages = [];
	for (const ch of CHARS) {
		const key = tileKey(ch);
		if (key !== ch) continue;
		const need = poolBring[key] || 0,
			have = poolInv[key] || 0;
		if (need > have) {
			for (const mark of CHARS) if (tileKey(mark) === key) shortSet.add(mark);
			shortInfo.set(key, { have, need: need - have });
			shortages.push({ ch: tilePoolLabel(key), need, have });
		}
	}
	currentShortSet = shortSet;

	document.querySelectorAll('.tilepreview').forEach((preview) => {
		const t = txt(preview.dataset.signKey);
		const field = preview.dataset.field;
		const textValue = t[field] || '';
		const nextShortSig = field === 'next' ? [...shortSet].join('') : '';
		const meta = ensurePreviewMeta(preview.dataset.signKey, field);
		const bonusSig = String(meta.bonusSeed || '');
		const animate = preview.dataset.animateNext;
		delete preview.dataset.animateNext;
		if (
			!animate &&
			preview.dataset.renderText === textValue &&
			preview.dataset.renderShortSig === nextShortSig &&
			preview.dataset.renderBonusSig === bonusSig
		) {
			return;
		}
		preview.dataset.renderText = textValue;
		preview.dataset.renderShortSig = nextShortSig;
		preview.dataset.renderBonusSig = bonusSig;
		fillTilePreview(
			preview,
			textValue,
			field === 'next' ? shortSet : null,
			animate,
			meta
		);
	});

	// Step 1 bring
	if (!fillTiles(document.getElementById('bringTiles'), bring, shortInfo))
		document.getElementById('bringTiles').innerHTML =
			'<div class="empty">Nothing new to bring.</div>';

	// Step 2 swap
	const swapEl = document.getElementById('swapTiles');
	swapEl.innerHTML = '';
	swapEl.className = 'swapgrid';
	let hasSwap = false;
	for (const s of perSign) {
		if (!hasTiles(s.swap)) continue;
		hasSwap = true;
		const blk = document.createElement('div');
		blk.className = 'swapblock';
		const h = document.createElement('h3');
		h.textContent = s.label;
		blk.appendChild(h);
		const row = document.createElement('div');
		row.className = 'tiles';
		fillTiles(row, s.swap, null);
		blk.appendChild(row);
		swapEl.appendChild(blk);
	}
	if (!hasSwap) {
		swapEl.className = 'tiles';
		swapEl.innerHTML = '<div class="empty">No cross-sign swaps.</div>';
	}

	// Step 3 per sign
	const ps = document.getElementById('perSign');
	ps.innerHTML = '';
	for (const s of perSign) {
		const blk = document.createElement('div');
		blk.className = 'signblock';
		const sheet = document.createElement('div');
		sheet.className = 'signsheet';
		const h = document.createElement('h3');
		h.textContent = s.label;
		sheet.appendChild(h);
		sheet.appendChild(actionBox('take', tileRow('Take down', 'take', s.take)));
		if (hasTiles(s.swap))
			sheet.appendChild(actionBox('swapin', tileRow('Swap in', 'swapin', s.swap)));
		sheet.appendChild(actionBox('put', tileRow('Put up', 'put', s.put)));
		blk.appendChild(sheet);
		ps.appendChild(blk);
	}

	// leftover
	const left = {};
	for (const ch of CHARS) {
		if (tileKey(ch) !== ch) continue;
		const v = (poolInv[ch] || 0) + (poolCurrent[ch] || 0) - (poolDeployed[ch] || 0);
		if (v > 0) left[ch] = v;
	}
	if (!fillTiles(document.getElementById('leftTiles'), left, null))
		document.getElementById('leftTiles').innerHTML =
			'<div class="empty">Box is empty after this change.</div>';

	// alert
	const alertSlot = document.getElementById('alertSlot');
	alertSlot.innerHTML = '';
	if (shortages.length) {
		const div = document.createElement('div');
		div.className = 'alertbar';
		const title = document.createElement('strong');
		title.textContent = 'Not enough tiles.';
		div.appendChild(title);
		div.appendChild(
			document.createTextNode(' The box does not hold enough tiles for this change.')
		);
		const list = document.createElement('div');
		list.className = 'shortagelist';
		for (const s of shortages) {
			const row = document.createElement('div');
			row.className = 'shortagerow';
			for (const text of [s.ch, `need ${s.need}`, `have ${s.have}`]) {
				const cell = document.createElement('span');
				cell.textContent = text;
				row.appendChild(cell);
			}
			list.appendChild(row);
		}
		div.appendChild(list);
		const note = document.createElement('div');
		note.className = 'shortagenote';
		note.textContent = 'The red tiles are the ones you are short on.';
		div.appendChild(note);
		alertSlot.appendChild(div);
	}

	// unknown note
	const noteSlot = document.getElementById('noteSlot');
	noteSlot.innerHTML = '';
	if (unknown.size) {
		const div = document.createElement('div');
		div.className = 'notebar';
		div.textContent =
			'These typed characters have no tile and were ignored: ' + [...unknown].join('  ');
		noteSlot.appendChild(div);
	}

	document.getElementById('printDate').textContent = new Date().toLocaleDateString();
}
function actionBox(cls, row) {
	const box = document.createElement('div');
	box.className = 'actionbox ' + cls;
	box.appendChild(row);
	return box;
}
function tileRow(label, cls, map) {
	const row = document.createElement('div');
	row.className = 'tilerow';
	const l = document.createElement('span');
	l.className = 'rowlab ' + cls;
	l.textContent = label;
	row.appendChild(l);
	let any = false;
	for (const ch of CHARS) {
		const n = map[ch] || 0;
		if (n > 0) {
			row.appendChild(tileCount(ch, n, false));
			any = true;
		}
	}
	if (!any) {
		const e = document.createElement('span');
		e.className = 'empty';
		e.textContent = '—';
		row.appendChild(e);
	}
	return row;
}

/* CSV */
function csvField(s) {
	s = String(s);
	return s.includes(',') || s.includes('"') || s.includes('\n')
		? '"' + s.replace(/"/g, '""') + '"'
		: s;
}
function exportCSV() {
	const I = inv();
	let out = 'character,count\n';
	for (const ch of CHARS) out += csvField(ch) + ',' + (I[ch] || 0) + '\n';
	const blob = new Blob([out], { type: 'text/csv' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'sign_inventory.csv';
	document.body.appendChild(a);
	a.click();
	a.remove();
}
function parseCSV(text) {
	const rows = [];
	let i = 0,
		field = '',
		row = [],
		inQ = false;
	const pushF = () => {
		row.push(field);
		field = '';
	};
	const pushR = () => {
		if (row.length || field !== '') {
			pushF();
			rows.push(row);
			row = [];
		}
	};
	while (i < text.length) {
		const ch = text[i];
		if (inQ) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQ = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}
		if (ch === '"') {
			inQ = true;
			i++;
			continue;
		}
		if (ch === ',') {
			pushF();
			i++;
			continue;
		}
		if (ch === '\n') {
			pushR();
			i++;
			continue;
		}
		if (ch === '\r') {
			i++;
			continue;
		}
		field += ch;
		i++;
	}
	pushR();
	return rows;
}
function importCSV(file) {
	const reader = new FileReader();
	reader.onload = () => {
		const rows = parseCSV(reader.result);
		const I = inv();
		let applied = 0;
		for (const r of rows) {
			if (r.length < 2) continue;
			let ch = r[0];
			const cnt = parseInt(r[1], 10);
			if (ch == null) continue;
			ch = ch.trim();
			if (ch.length === 1) ch = ch.toUpperCase();
			if (CHARSET.has(ch) && !isNaN(cnt)) {
				I[ch] = Math.max(0, cnt);
				applied++;
			}
		}
		saveState();
		buildInv();
		calculate();
		alert(
			applied
				? 'Loaded ' + applied + ' tile counts.'
				: 'No matching tiles found. Use two columns: character, count.'
		);
	};
	reader.readAsText(file);
}

function bindEntryActions() {
	document.getElementById('printBtn').addEventListener('click', () => {
		printSign();
	});
	document.getElementById('saveBtn').addEventListener('click', saveStateFile);
	document
		.getElementById('loadBtn')
		.addEventListener('click', () => document.getElementById('loadInput').click());
	document.getElementById('loadInput').addEventListener('change', (e) => {
		if (e.target.files[0]) loadStateFile(e.target.files[0]);
		e.target.value = '';
	});
	bindEntryDrop();
	document.getElementById('promoteBtn').addEventListener('click', () => {
		if (!confirm('Confirm, this will remove the current sign.')) return;
		for (const sign of SIGNS) {
			const t = txt(sign.key);
			const nextMeta = ensurePreviewMeta(sign.key, 'next');
			commitHighScore(nextMeta.score);
			t.now = t.next;
			t.next = '';
			if (!state.preview || typeof state.preview !== 'object') state.preview = {};
			const nowKey = previewKey(sign.key, 'now');
			const nextKey = previewKey(sign.key, 'next');
			state.preview[nowKey] = normalizePreviewMeta(nextMeta);
			state.preview[nextKey] = normalizePreviewMeta(null);
			state.preview[nextKey].dateKey = localDateKey();
		}
		buildEntry();
		bindEntryActions();
		calculate();
		saveState();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});
}
function printSign() {
	preparePrintScaling();
	window.print();
}
function bindKeyboardShortcuts() {
	window.addEventListener('keydown', (e) => {
		const shortcutKey =
			(e.metaKey || e.ctrlKey) && !e.altKey && typeof e.key === 'string'
				? e.key.toLowerCase()
				: '';
		if (shortcutKey === 'p') {
			e.preventDefault();
			playTileClacks(3);
			printSign();
		}
	});
}
function bindEntryDrop() {
	const entry = document.getElementById('entry');
	entry.addEventListener('dragover', (e) => {
		e.preventDefault();
		entry.classList.add('dragging');
		setLoadStatus('Drop JSON file to load it.', '');
	});
	entry.addEventListener('dragleave', (e) => {
		if (!entry.contains(e.relatedTarget)) {
			entry.classList.remove('dragging');
		}
	});
	entry.addEventListener('drop', (e) => {
		e.preventDefault();
		entry.classList.remove('dragging');
		const file = [...(e.dataTransfer.files || [])].find(
			(f) => f.name.toLowerCase().endsWith('.json') || f.type === 'application/json'
		);
		if (!file) {
			setLoadStatus('Drop a .json save file here.', 'bad');
			return;
		}
		loadStateFile(file);
	});
}
async function saveStateFile() {
	saveState();
	const stamp = fileTimestamp(new Date());
	const filename = 'sign_swap_' + stamp + '.json';
	const data = {
		app: 'sign_swap',
		version: 2,
		savedAt: new Date().toISOString(),
		state,
	};
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

	if (window.showSaveFilePicker) {
		try {
			const handle = await window.showSaveFilePicker({
				suggestedName: filename,
				types: [
					{
						description: 'JSON save file',
						accept: { 'application/json': ['.json'] },
					},
				],
			});
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
			setLoadStatus('Saved ' + filename + '.', 'good');
			return;
		} catch (err) {
			if (err && err.name === 'AbortError') return;
		}
	}

	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	setLoadStatus('Downloaded ' + filename + '.', 'good');
}
function loadStateFile(file) {
	setLoadStatus('Loading ' + file.name + '...', '');
	const reader = new FileReader();
	reader.onload = () => {
		try {
			const parsed = JSON.parse(reader.result);
			const nextState = normalizeLoadedState(parsed);
			state = nextState;
			saveState();
			buildEntry();
			bindEntryActions();
			buildInv();
			calculate();
			setLoadStatus('Loaded ' + file.name + '.', 'good');
		} catch (err) {
			setLoadStatus('Could not load ' + file.name + '. Use a Sign Swap JSON save file.', 'bad');
		}
	};
	reader.onerror = () => setLoadStatus('Could not read ' + file.name + '.', 'bad');
	reader.readAsText(file);
}
function normalizeLoadedState(data) {
	const raw = data && data.state ? data.state : data;
	if (!raw || typeof raw !== 'object') throw new Error('Invalid state');
	const next = { inv: {}, text: {}, preview: {}, highScore: 0 };
	next.highScore = Math.max(0, parseInt(raw.highScore, 10) || 0);
	const rawInv = raw.inv && typeof raw.inv === 'object' ? raw.inv : {};
	for (const ch of CHARS) {
		const n = parseInt(rawInv[ch], 10);
		next.inv[ch] = isNaN(n) || n < 0 ? DEFAULT_INV[ch] || 0 : n;
	}
	const rawText = raw.text && typeof raw.text === 'object' ? raw.text : {};
	const rawPreview = raw.preview && typeof raw.preview === 'object' ? raw.preview : {};
	const legacyMeta =
		Array.isArray(raw.previewBonuses) && raw.previewBonuses.some(Boolean)
			? { bonusSeed: makeSeed(), bonuses: normalizeBonusBoard(raw.previewBonuses), score: 0 }
			: null;
	for (const sign of SIGNS) {
		const t = rawText[sign.key] && typeof rawText[sign.key] === 'object' ? rawText[sign.key] : {};
		next.text[sign.key] = { now: String(t.now || ''), next: String(t.next || '') };
		for (const field of ['now', 'next']) {
			const key = previewKey(sign.key, field);
			next.preview[key] = normalizePreviewMeta(rawPreview[key] || legacyMeta);
		}
	}
	return next;
}
function setLoadStatus(msg, kind) {
	const el = document.getElementById('loadStatus');
	if (!el) return;
	el.textContent = msg;
	el.className = 'loadstatus' + (kind ? ' ' + kind : '');
}
function fileTimestamp(d) {
	const pad = (n) => String(n).padStart(2, '0');
	return (
		d.getFullYear() +
		'-' +
		pad(d.getMonth() + 1) +
		'-' +
		pad(d.getDate()) +
		'_' +
		pad(d.getHours()) +
		pad(d.getMinutes()) +
		pad(d.getSeconds())
	);
}
function preparePrintScaling() {
	clearPrintScaling();
	const maxHeight = 9.3 * 96;
	document.querySelectorAll('.panel.work .signblock').forEach((block) => {
		const sheet = block.querySelector('.signsheet');
		if (!sheet) return;
		const scale = Math.min(1, maxHeight / sheet.scrollHeight);
		block.style.setProperty('--print-scale', Math.max(0.55, scale).toFixed(3));
	});
}
function clearPrintScaling() {
	document.querySelectorAll('.panel.work .signblock').forEach((block) => {
		block.style.removeProperty('--print-scale');
	});
}
async function loadTaglineQuote() {
	const el = document.getElementById('tagline');
	if (!el) return;
	const fallback = 'Oops, no quote today!';
	const renderQuote = (quote, author) => {
		el.textContent = quote ? `"${quote}"` : fallback;
		if (quote && author) {
			const by = document.createElement('span');
			by.className = 'quote-author';
			by.textContent = author;
			el.appendChild(by);
		}
	};
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 3500);
		const res = await fetch('https://motivational-spark-api.vercel.app/api/quotes/random', {
			signal: controller.signal,
		});
		clearTimeout(timer);
		if (!res.ok) throw new Error('Quote request failed');
		const data = await res.json();
		const q = data && data.quote;
		const a = data && data.author;
		if (!q) throw new Error('Quote missing');
		renderQuote(q, a);
	} catch (e) {
		renderQuote('', '');
	}
}

/* init */
async function init() {
	await loadDefaultInv();
	const saved = loadState();
	if (saved) {
		state = normalizeLoadedState(saved);
	}
	rotateNextPreviewBonusesIfNeeded();
	buildWordmark();
	loadTaglineQuote();
	buildEntry();
	buildInv();
	updateHighScoreBadge(false);
	calculate();

	bindEntryActions();
	document.getElementById('exportBtn').addEventListener('click', exportCSV);
	document.getElementById('importInput').addEventListener('change', (e) => {
		if (e.target.files[0]) importCSV(e.target.files[0]);
		e.target.value = '';
	});
	document.getElementById('resetInvBtn').addEventListener('click', () => {
		if (confirm('Reset inventory to the original counts?')) {
			state.inv = Object.assign({}, DEFAULT_INV);
			saveState();
			buildInv();
			calculate();
		}
	});
	document.getElementById('randomizeBonusesBtn').addEventListener('click', randomizePreviewBonuses);
	document.getElementById('clearHighScoreBtn').addEventListener('click', clearHighScore);
	bindKeyboardShortcuts();
	window.addEventListener('beforeprint', preparePrintScaling);
	window.addEventListener('afterprint', clearPrintScaling);
	scheduleNextBonusRotation();
	document.body.classList.remove('app-loading');
}
init().catch((e) => {
	console.error(e);
	document.body.classList.remove('app-loading');
});
