'use strict';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '1234567890'.split('');
const SYMBOLS = [',', '.', '-', '/', ':', '!', '?', '&', '%', ';', '"', '$', '@'];
const CHARS = [...LETTERS, ...DIGITS, ...SYMBOLS];
const CHARSET = new Set(CHARS);
const TILE_EQUIV = { 9: '6', '-': 'I', '/': 'I' };
const TILE_POOL_LABEL = { 6: '6/9', I: 'I/-//' };
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

let state = { inv: {}, text: {} };

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
function fillTiles(el, map, shortSet) {
	el.innerHTML = '';
	let any = false;
	for (const ch of CHARS) {
		const n = map[ch] || 0;
		if (n > 0) {
			el.appendChild(tileCount(ch, n, shortSet && shortSet.has(ch)));
			any = true;
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
function fillTilePreview(el, text, shortSet, animate) {
	el.innerHTML = '';
	let score = 0;
	let lastTile = null;
	const lines = String(text || '')
		.toUpperCase()
		.split(/\r?\n/);
	for (const line of lines) {
		const row = document.createElement('div');
		row.className = 'previewline';
		const parts = line.split(/(\s+)/);
		for (const part of parts) {
			if (!part) continue;
			if (/^\s+$/.test(part)) {
				for (let i = 0; i < part.length; i++) {
					row.appendChild(document.createElement('span')).className = 'previewspace';
				}
				continue;
			}
			const word = document.createElement('span');
			word.className = 'previewword';
			for (const ch of part) {
				if (!CHARSET.has(ch)) continue;
				score += VALUES[ch] || 0;
				lastTile = word.appendChild(tileEl(ch, shortSet && shortSet.has(ch) ? 'short' : ''));
			}
			if (word.childNodes.length) row.appendChild(word);
		}
		el.appendChild(row);
	}
	const foot = document.createElement('div');
	foot.className = 'previewscore';
	foot.textContent = 'Total score: ' + score;
	el.appendChild(foot);
	if (animate && lastTile) lastTile.classList.add('slam');
}

/* counting */
function countText(text, counts, unknown) {
	for (const ch of (text || '').toUpperCase()) {
		if (CHARSET.has(ch)) counts[ch] = (counts[ch] || 0) + 1;
		else if (ch.trim() !== '') unknown.add(ch);
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
	fillTilePreview(preview, ta.value);
	ta.addEventListener('focus', warmAudio);
	ta.addEventListener('pointerdown', warmAudio);
	ta.addEventListener('input', () => {
		txt(signKey)[field] = ta.value;
		preview.dataset.animateNext = '1';
		saveState();
		calculate();
	});
	ta.addEventListener('keydown', (e) => playTileSound(e.key));
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
function playTileSound(key) {
	const isTileKey = typeof key === 'string' && /^[a-z0-9]$/i.test(key);
	const isEditKey = key === 'Backspace' || key === 'Delete';
	if (!isTileKey && !isEditKey) return;
	try {
		audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
		if (audioCtx.state === 'suspended') {
			audioCtx
				.resume()
				.then(playTileClack)
				.catch(() => {});
			return;
		}
		playTileClack();
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
		const validCurrent = Math.min(poolCurrent[key] || 0, poolInv[key] || 0);
		const transferable = Math.min(
			poolRemoves[key] || 0,
			Math.max(0, validCurrent - (poolStays[key] || 0))
		);
		const availableForPool = Math.max(0, transferable - (poolSwapUsed[key] || 0));
		const pooledMoved = Math.min(adds[ch] || 0, availableForPool);
		if (pooledMoved > 0) {
			swap[ch] = pooledMoved;
			poolSwapUsed[key] = (poolSwapUsed[key] || 0) + pooledMoved;
		}
		const fromBox = (adds[ch] || 0) - pooledMoved;
		if (fromBox > 0) bring[ch] = fromBox;
	}
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

	// shortages: total deployed exceeds what's owned
	const shortSet = new Set();
	const shortages = [];
	for (const ch of CHARS) {
		const key = tileKey(ch);
		if (key !== ch) continue;
		const need = poolDeployed[key] || 0,
			have = poolInv[key] || 0;
		if (need > have) {
			for (const mark of CHARS) if (tileKey(mark) === key) shortSet.add(mark);
			shortages.push({ ch: tilePoolLabel(key), need, have });
		}
	}

	document.querySelectorAll('.tilepreview').forEach((preview) => {
		const t = txt(preview.dataset.signKey);
		const field = preview.dataset.field;
		const animate = preview.dataset.animateNext === '1';
		delete preview.dataset.animateNext;
		fillTilePreview(preview, t[field] || '', field === 'next' ? shortSet : null, animate);
	});

	// Step 1 bring
	if (!fillTiles(document.getElementById('bringTiles'), bring, shortSet))
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
		fillTiles(row, s.swap, shortSet);
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
		const v = (poolInv[ch] || 0) - (poolDeployed[ch] || 0);
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
		const parts = shortages.map((s) => `${s.ch} (need ${s.need}, have ${s.have})`).join(' · ');
		div.innerHTML = `<strong>Not enough tiles.</strong> The box does not hold enough for all three signs: ${parts}. The red-ringed tiles are the ones you are short on.`;
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
		preparePrintScaling();
		window.print();
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
			t.now = t.next;
			t.next = '';
		}
		saveState();
		buildEntry();
		bindEntryActions();
		calculate();
		window.scrollTo({ top: 0, behavior: 'smooth' });
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
	const next = { inv: {}, text: {} };
	const rawInv = raw.inv && typeof raw.inv === 'object' ? raw.inv : {};
	for (const ch of CHARS) {
		const n = parseInt(rawInv[ch], 10);
		next.inv[ch] = isNaN(n) || n < 0 ? DEFAULT_INV[ch] || 0 : n;
	}
	const rawText = raw.text && typeof raw.text === 'object' ? raw.text : {};
	for (const sign of SIGNS) {
		const t = rawText[sign.key] && typeof rawText[sign.key] === 'object' ? rawText[sign.key] : {};
		next.text[sign.key] = { now: String(t.now || ''), next: String(t.next || '') };
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
		state = Object.assign({ inv: {}, text: {} }, saved);
		if (!state.inv) state.inv = {};
		if (!state.text) state.text = {};
	}
	buildWordmark();
	loadTaglineQuote();
	buildEntry();
	buildInv();
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
	window.addEventListener('beforeprint', preparePrintScaling);
	window.addEventListener('afterprint', clearPrintScaling);
}
init();
