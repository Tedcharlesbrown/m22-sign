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
// Static GitHub Pages-friendly common-word list. Exact words this list misses
// are checked with dictionaryapi.dev as a last resort.
const DICTIONARY_URL = 'words.txt';
// Thesaurus lookup: "means like" related words. Free, no key, CORS-enabled.
const DATAMUSE_URL = 'https://api.datamuse.com/words';
// Last-resort exact-word lookup for words missing from the static list.
const DICTIONARY_API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
// Common words skipped when learning the personal frequently-used list. This is a
// small offline fallback; the fuller stopwords-iso list loads from stopwords.json
// at startup (see loadStopWords) and is merged into this same set.
const STOP_WORDS = new Set(
	(
		'a about above after again against all am an and any are as at be because been before being ' +
		'below between both but by can did do does doing down during each few for from further had has ' +
		'have having he her here hers herself him himself his how if in into is it its itself just me ' +
		'more most my myself no nor not now of off on once only or other our ours ourselves out over own ' +
		'same she should so some such than that the their theirs them themselves then there these they ' +
		'this those through to too under until up very was we were what when where which while who whom ' +
		'why will with you your yours yourself yourselves'
	)
		.toUpperCase()
		.split(' ')
);
const STOP_WORDS_URL = 'stopwords.json';
async function loadStopWords() {
	try {
		const res = await fetch(STOP_WORDS_URL, { cache: 'force-cache' });
		if (!res.ok) throw new Error('stopwords.json request failed');
		const list = await res.json();
		if (Array.isArray(list)) {
			for (const entry of list) {
				const word = String(entry || '').trim().toUpperCase();
				if (/^[A-Z]{2,}$/.test(word)) STOP_WORDS.add(word);
			}
		}
	} catch (e) {
		// Keep the built-in fallback set; learning still works without the fuller list.
		console.warn('Could not load stopwords.json; using built-in stop words.', e);
	}
}
// Premade "Your words" seeds, loaded from custom.json. These always appear in the
// dictionary's "Your words" group (when buildable); learned words rank above them.
const CUSTOM_WORDS_URL = 'custom.json';
let customWords = [];
let customWordsPromise = null;
function loadCustomWords() {
	if (customWordsPromise) return customWordsPromise;
	customWordsPromise = fetch(CUSTOM_WORDS_URL, { cache: 'no-cache' })
		.then((res) => {
			if (!res.ok) throw new Error('custom.json request failed');
			return res.json();
		})
		.then((list) => {
			const seen = new Set();
			customWords = (Array.isArray(list) ? list : [])
				.map((entry) => String(entry || '').trim().toUpperCase())
				.filter((word) => /^[A-Z]{2,17}$/.test(word) && !seen.has(word) && seen.add(word));
			return customWords;
		})
		.catch((e) => {
			console.warn('Could not load custom.json; no premade words.', e);
			return customWords;
		});
	return customWordsPromise;
}
const FALLBACK_WORDS = [
	'ADVENTURE',
	'ARROW',
	'BEACH',
	'BEACON',
	'BIRCH',
	'BREEZE',
	'BRIGHT',
	'CAMP',
	'COAST',
	'COURAGE',
	'DREAM',
	'DUNE',
	'FRESH',
	'GLOW',
	'GUIDE',
	'HARBOR',
	'HOPE',
	'LAKE',
	'LIGHT',
	'MILES',
	'NORTH',
	'PATH',
	'PEACE',
	'ROAD',
	'SHORE',
	'SIGN',
	'SOUTH',
	'SPARK',
	'TRAIL',
	'WAVE',
	'WISDOM',
];
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
const SHARE_URL_TARGET_LENGTH = 2800;
const SHARE_TEXT_MAX_LENGTH = 500;

let state = { inv: {}, text: {}, preview: {}, highScore: 0, wordUses: {}, hiddenWords: {} };
let currentShortSet = new Set();
const textCountCache = new Map();
const buildableWordCache = new Map();
let dictionaryWords = null;
let dictionaryPromise = null;
const relatedCache = new Map(); // query -> related words (uppercase), from the thesaurus
const dictionaryApiCache = new Map(); // word -> true/false, exact dictionaryapi.dev result
let currentBoxLeft = null;
let relatedTimer = 0;
let dictionaryApiTimer = 0;
let dictionarySearchTimer = 0;
let dictionarySearchToken = 0;
let dictionaryView = 'possible';

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
function invalidateDictionaryAvailability() {
	buildableWordCache.clear();
}
let calculateTimer = 0;
let saveTimer = 0;
function scheduleCalculate(delay) {
	clearTimeout(calculateTimer);
	calculateTimer = setTimeout(calculate, delay == null ? 250 : delay);
}
function scheduleSaveState(delay) {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(saveState, delay == null ? 160 : delay);
}
function scheduleQrRefresh() {
	clearTimeout(scheduleQrRefresh.timer);
	scheduleQrRefresh.timer = setTimeout(updateQrShare, 220);
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
	box.addEventListener('pointerenter', playHoverClack);
	return box;
}
function fillTiles(el, map, shortInfo) {
	el.innerHTML = '';
	let any = false;
	const frag = document.createDocumentFragment();
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
					frag.appendChild(tileCount(ch, haveCount, false));
					any = true;
				}
				if (missingCount > 0) {
					missing[ch] = (missing[ch] || 0) + missingCount;
					any = true;
				}
			} else {
				frag.appendChild(tileCount(ch, n, shortInfo && shortInfo.has && shortInfo.has(ch)));
				any = true;
			}
		}
	}
	for (const ch of CHARS) {
		const n = missing[ch] || 0;
		if (n > 0) {
			frag.appendChild(tileCount(ch, n, true));
		}
	}
	el.appendChild(frag);
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
function mapSig(map) {
	return CHARS.map((ch) => map[ch] || 0).join(',');
}
function setSig(el, sig) {
	if (el.dataset.renderSig === sig) return false;
	el.dataset.renderSig = sig;
	return true;
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
function hashSeed(text) {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function dailyBonusSeed(signKey, field, dateKey) {
	return hashSeed('signswap:' + dateKey + ':' + signKey + ':' + field);
}
function localDateKey(d) {
	const date = d || new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}
function wordScore(word) {
	let score = 0;
	for (const ch of word) score += VALUES[ch] || 0;
	return score;
}
function canBuildWord(word, availablePools) {
	const remaining = Object.assign({}, availablePools);
	for (const ch of word) {
		if (!/[A-Z]/.test(ch)) return false;
		const key = tileKey(ch);
		if ((remaining[key] || 0) <= 0) return false;
		remaining[key]--;
	}
	return true;
}
function fuzzyMatch(query, word) {
	// True when every query letter appears in order within the word (subsequence),
	// so partials and small typos still match (e.g. "hpe" -> "HOPE").
	let i = 0;
	for (let j = 0; j < word.length && i < query.length; j++) {
		if (word[j] === query[i]) i++;
	}
	return i === query.length;
}
function makeDictionaryIndex(words) {
	const byFirst = {};
	for (const letter of LETTERS) byFirst[letter] = [];
	for (const word of words) {
		const first = word[0];
		if (byFirst[first]) byFirst[first].push(word);
	}
	return { byFirst };
}
function inventorySignature() {
	const I = dictionaryAvailableTiles();
	return CHARS.map((ch) => `${ch}:${I[ch] || 0}`).join('|');
}
function dictionaryAvailableTiles() {
	return currentBoxLeft || inv();
}
function getBuildableWordData() {
	const words = dictionaryWords || FALLBACK_WORDS;
	const sig = inventorySignature() + ':' + words.length;
	if (buildableWordCache.has(sig)) return buildableWordCache.get(sig);
	const available = poolCounts(dictionaryAvailableTiles());
	const buildable = [];
	for (const word of words) {
		if (word.length > 1 && word.length <= PREVIEW_COLS && canBuildWord(word, available)) buildable.push(word);
	}
	const data = { words: buildable, index: makeDictionaryIndex(buildable) };
	buildableWordCache.clear();
	buildableWordCache.set(sig, data);
	return data;
}
function possibleWords(query) {
	const q = String(query || '').trim().toUpperCase();
	const data = getBuildableWordData();
	const words = data.words;
	// Words are already frequency-ordered (most common first); keep that order.
	if (!q) {
		return words.slice(0, 120);
	}
	// Exact substring matches first, then looser fuzzy matches — each common-first.
	const substr = [];
	const fuzzy = [];
	const fuzzyWords = q.length === 1 ? data.index.byFirst[q] || [] : words;
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if (word.includes(q)) substr.push(word);
		if (substr.length >= 120) break;
	}
	if (substr.length < 120) {
		for (let i = 0; i < fuzzyWords.length; i++) {
			const word = fuzzyWords[i];
			if (!word.includes(q) && fuzzyMatch(q, word)) fuzzy.push(word);
			if (substr.length + fuzzy.length >= 120) break;
		}
	}
	return substr.concat(fuzzy).slice(0, 120);
}
function extractWords(text) {
	const out = [];
	for (const match of String(text || '').toUpperCase().matchAll(/[A-Z]{2,}/g)) {
		const word = match[0];
		if (word.length <= PREVIEW_COLS && !STOP_WORDS.has(word)) out.push(word);
	}
	return out;
}
function currentSignTexts() {
	const texts = [];
	for (const sign of SIGNS) {
		const t = txt(sign.key);
		texts.push(t.now, t.next);
	}
	return texts;
}
function recordUsedWords(texts) {
	if (!state.wordUses || typeof state.wordUses !== 'object') state.wordUses = {};
	const seen = new Set();
	for (const text of texts) for (const word of extractWords(text)) seen.add(word);
	if (!seen.size) return;
	for (const word of seen) state.wordUses[word] = (state.wordUses[word] || 0) + 1;
}
function wordTileShortage(word, available) {
	// Per-letter flags: true where the box can't supply that tile (rendered red).
	const remaining = Object.assign({}, available);
	const flags = [];
	for (const ch of word) {
		const key = tileKey(ch);
		if ((remaining[key] || 0) > 0) {
			remaining[key]--;
			flags.push(false);
		} else {
			flags.push(true);
		}
	}
	return flags;
}
function matchedUsedWords(query, available) {
	const uses = state.wordUses || {};
	const hidden = state.hiddenWords || {};
	const q = String(query || '').trim().toUpperCase();
	// Premade seeds from custom.json plus the learned list, deduped.
	const candidates = new Set([...customWords, ...Object.keys(uses).filter((word) => (uses[word] || 0) >= 2)]);
	const words = [...candidates].filter(
		(word) =>
			word.length > 1 &&
			word.length <= PREVIEW_COLS &&
			!hidden[word] &&
			(!q || word.includes(q) || fuzzyMatch(q, word))
	);
	// "Your words" always show, even when the box is short — so don't filter by
	// buildability here; short letters get marked red at render time.
	const buildable = new Map();
	for (const word of words) buildable.set(word, !wordTileShortage(word, available).some(Boolean));
	words.sort((a, b) => {
		// Learned counts win over custom seeds (which sit at 0).
		const ua = uses[a] || 0,
			ub = uses[b] || 0;
		if (ub !== ua) return ub - ua;
		// Then words she can build now, then alphabetical.
		if (buildable.get(a) !== buildable.get(b)) return buildable.get(a) ? -1 : 1;
		return a.localeCompare(b);
	});
	// Keep it short unless she's actively searching.
	return words.slice(0, q ? 40 : 10);
}
async function loadDictionaryWords() {
	if (dictionaryWords) return dictionaryWords;
	if (!dictionaryPromise) {
		dictionaryPromise = fetch(DICTIONARY_URL)
			.then((res) => {
				if (!res.ok) throw new Error('Dictionary request failed');
				return res.text();
			})
			.then((text) => {
				const seen = new Set();
				dictionaryWords = text
					.split(/\r?\n/)
					.map((word) => word.trim().toUpperCase())
					.filter((word) => /^[A-Z]{2,17}$/.test(word))
					.filter((word) => {
						if (seen.has(word)) return false;
						seen.add(word);
						return true;
					});
				buildableWordCache.clear();
				return dictionaryWords;
			})
			.catch(() => {
				dictionaryWords = FALLBACK_WORDS;
				buildableWordCache.clear();
				return dictionaryWords;
			});
	}
	return dictionaryPromise;
}
function dictWordRow(word, shortFlags, removable, useCount) {
	const row = document.createElement('div');
	row.className = 'dict-word';
	const tiles = document.createElement('div');
	tiles.className = 'dict-tiles';
	let i = 0;
	for (const ch of word) {
		const short = shortFlags && shortFlags[i];
		tiles.appendChild(tileEl(ch, 'scrabble dict-tile' + (short ? ' short' : '')));
		i++;
	}
	row.appendChild(tiles);
	const actions = document.createElement('div');
	actions.className = 'dict-rowactions';
	if (useCount > 0) {
		const count = document.createElement('span');
		count.className = 'dict-count';
		count.textContent = useCount + '×';
		actions.appendChild(count);
	}
	const score = document.createElement('span');
	score.className = 'dict-score';
	score.textContent = wordScore(word) + ' pts';
	actions.appendChild(score);
	const copy = document.createElement('button');
	copy.type = 'button';
	copy.className = 'ghost save-action dict-copy';
	copy.textContent = 'Copy';
	copy.setAttribute('aria-label', 'Copy ' + word);
	actions.appendChild(copy);
	if (removable) {
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'dict-remove';
		remove.textContent = '×';
		remove.title = 'Remove from Your words';
		remove.setAttribute('aria-label', 'Remove ' + word + ' from Your words');
		remove.addEventListener('click', (e) => {
			e.stopPropagation();
			removeYourWord(word);
		});
		actions.appendChild(remove);
	}
	row.appendChild(actions);
	row.title = 'Copy "' + word + '"';
	row.addEventListener('click', () => copyWord(word, copy));
	return row;
}
function removeYourWord(word) {
	if (!state.wordUses || typeof state.wordUses !== 'object') state.wordUses = {};
	if (!state.hiddenWords || typeof state.hiddenWords !== 'object') state.hiddenWords = {};
	const count = state.wordUses[word] || 0;
	if (count > 0) state.hiddenWords[word] = count;
	else state.hiddenWords[word] = 1;
	saveState();
	renderCurrentDictionaryView();
}
function restoreYourWord(word) {
	if (!state.hiddenWords || typeof state.hiddenWords !== 'object') state.hiddenWords = {};
	if (!state.wordUses || typeof state.wordUses !== 'object') state.wordUses = {};
	const count = parseInt(state.hiddenWords[word], 10) || 0;
	if (count >= 2) state.wordUses[word] = Math.max(state.wordUses[word] || 0, count);
	delete state.hiddenWords[word];
	saveState();
	renderCurrentDictionaryView();
}
function copyWord(word, btn) {
	const flash = () => {
		if (!btn) return;
		btn.textContent = 'Copied!';
		btn.classList.add('copied');
		clearTimeout(btn._resetTimer);
		btn._resetTimer = setTimeout(() => {
			btn.textContent = 'Copy';
			btn.classList.remove('copied');
		}, 1100);
	};
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(word).then(flash).catch(() => fallbackCopy(word, flash));
	} else {
		fallbackCopy(word, flash);
	}
}
function fallbackCopy(text, done) {
	try {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		document.execCommand('copy');
		ta.remove();
		if (done) done();
	} catch (e) {}
}
function dictGroupLabel(text) {
	const label = document.createElement('div');
	label.className = 'dict-group';
	label.textContent = text;
	return label;
}
function exactDictionaryQuery(query) {
	const word = String(query || '').trim().toUpperCase();
	return /^[A-Z]{2,17}$/.test(word) ? word : '';
}
function setDictionarySearchStatus(possibleCount, relatedCount) {
	const status = document.getElementById('dictionaryStatus');
	if (!status) return;
	if (possibleCount) {
		status.textContent =
			`${possibleCount} possible word${possibleCount === 1 ? '' : 's'} shown.` +
			(relatedCount ? ` Plus ${relatedCount} related.` : '');
	} else if (relatedCount) {
		status.textContent = `${relatedCount} related word${relatedCount === 1 ? '' : 's'} shown.`;
	} else {
		status.textContent = 'No possible or related words found for this search.';
	}
}
function renderDictionaryWords() {
	clearTimeout(dictionarySearchTimer);
	clearTimeout(dictionaryApiTimer);
	clearTimeout(relatedTimer);
	dictionaryView = 'possible';
	dictionarySearchToken++;
	const results = document.getElementById('dictionaryResults');
	const status = document.getElementById('dictionaryStatus');
	const search = document.getElementById('dictionarySearch');
	if (!results || !status || !search) return;
	const query = search.value;
	const available = poolCounts(dictionaryAvailableTiles());
	const yours = matchedUsedWords(query, available);
	const yoursSet = new Set(yours);
	const more = possibleWords(query).filter((word) => !yoursSet.has(word));
	results.innerHTML = '';
	const frag = document.createDocumentFragment();
	if (yours.length) {
		frag.appendChild(dictGroupLabel('Your words'));
		for (const word of yours)
			frag.appendChild(dictWordRow(word, wordTileShortage(word, available), true, state.wordUses[word] || 0));
		if (more.length) frag.appendChild(dictGroupLabel('More words'));
	}
	for (const word of more) frag.appendChild(dictWordRow(word, null, false));
	results.appendChild(frag);
	const total = yours.length + more.length;
	status.textContent = total
		? `${total} possible word${total === 1 ? '' : 's'} shown.`
		: 'Looking for related words...';
	const shown = new Set([...yours, ...more]);
	shown.possibleCount = total;
	shown.relatedCount = 0;
	scheduleDictionaryFallbacks(query, shown);
}
function visibleYourWords() {
	const uses = state.wordUses || {};
	const hidden = state.hiddenWords || {};
	const words = new Set([...customWords, ...Object.keys(uses).filter((word) => (uses[word] || 0) >= 2)]);
	return [...words]
		.filter((word) => /^[A-Z]{2,17}$/.test(word) && !hidden[word])
		.sort((a, b) => {
			const ua = uses[a] || 0;
			const ub = uses[b] || 0;
			if (ub !== ua) return ub - ua;
			return a.localeCompare(b);
		});
}
async function renderYourWordsView() {
	cancelDictionarySearchWork();
	dictionaryView = 'yours';
	await loadCustomWords();
	const results = document.getElementById('dictionaryResults');
	const status = document.getElementById('dictionaryStatus');
	const search = document.getElementById('dictionarySearch');
	if (!results || !status) return;
	if (search) search.value = '';
	const available = poolCounts(dictionaryAvailableTiles());
	const words = visibleYourWords();
	results.innerHTML = '';
	const frag = document.createDocumentFragment();
	frag.appendChild(dictGroupLabel('Your words'));
	for (const word of words)
		frag.appendChild(dictWordRow(word, wordTileShortage(word, available), true, state.wordUses[word] || 0));
	results.appendChild(frag);
	status.textContent = words.length
		? `${words.length} word${words.length === 1 ? '' : 's'} sorted by frequency.`
		: 'No words used two separate times yet.';
}
async function renderHiddenWordsView() {
	cancelDictionarySearchWork();
	dictionaryView = 'hidden';
	await loadCustomWords();
	const results = document.getElementById('dictionaryResults');
	const status = document.getElementById('dictionaryStatus');
	const search = document.getElementById('dictionarySearch');
	if (!results || !status) return;
	if (search) search.value = '';
	const hidden = state.hiddenWords || {};
	const words = Object.keys(hidden)
		.filter((word) => hidden[word] && /^[A-Z]{2,17}$/.test(word))
		.sort((a, b) => a.localeCompare(b));
	results.innerHTML = '';
	const frag = document.createDocumentFragment();
	frag.appendChild(dictGroupLabel('Hidden words'));
	for (const word of words) frag.appendChild(hiddenWordRow(word));
	results.appendChild(frag);
	status.textContent = words.length
		? `${words.length} hidden word${words.length === 1 ? '' : 's'}.`
		: 'No hidden words.';
}
function hiddenWordRow(word) {
	const row = document.createElement('div');
	row.className = 'dict-word';
	const name = document.createElement('strong');
	name.className = 'dict-hidden-word';
	name.textContent = word;
	row.appendChild(name);
	const actions = document.createElement('div');
	actions.className = 'dict-rowactions';
	const restore = document.createElement('button');
	restore.type = 'button';
	restore.className = 'ghost save-action dict-copy';
	restore.textContent = 'Unhide';
	restore.setAttribute('aria-label', 'Unhide ' + word);
	restore.addEventListener('click', () => restoreYourWord(word));
	actions.appendChild(restore);
	row.appendChild(actions);
	return row;
}
function renderCurrentDictionaryView() {
	if (dictionaryView === 'yours') {
		renderYourWordsView();
	} else if (dictionaryView === 'hidden') {
		renderHiddenWordsView();
	} else {
		renderDictionaryWords();
	}
}
function cancelDictionarySearchWork() {
	clearTimeout(dictionarySearchTimer);
	clearTimeout(dictionaryApiTimer);
	clearTimeout(relatedTimer);
	dictionarySearchToken++;
}
function scheduleDictionaryFallbacks(query, shown, delay) {
	clearTimeout(dictionarySearchTimer);
	clearTimeout(dictionaryApiTimer);
	clearTimeout(relatedTimer);
	const token = ++dictionarySearchToken;
	dictionarySearchTimer = setTimeout(() => {
		if (token !== dictionarySearchToken) return;
		scheduleExactDictionaryWord(query, shown);
		scheduleRelatedWords(query, shown);
	}, delay == null ? 300 : delay);
}
async function fetchExactDictionaryWord(query) {
	const word = exactDictionaryQuery(query);
	if (!word) return false;
	if (dictionaryApiCache.has(word)) return dictionaryApiCache.get(word);
	try {
		const res = await fetch(`${DICTIONARY_API_URL}/${encodeURIComponent(word.toLowerCase())}`);
		if (!res.ok) {
			dictionaryApiCache.set(word, false);
			return false;
		}
		const data = await res.json();
		const found =
			Array.isArray(data) &&
			data.some(
				(entry) =>
					entry &&
					Array.isArray(entry.meanings) &&
					entry.meanings.some(
						(meaning) =>
							meaning &&
							Array.isArray(meaning.definitions) &&
							meaning.definitions.some((definition) => definition && definition.definition)
					)
			);
		dictionaryApiCache.set(word, found);
		return found;
	} catch (e) {
		return false;
	}
}
function scheduleExactDictionaryWord(query, shown) {
	clearTimeout(dictionaryApiTimer);
	const word = exactDictionaryQuery(query);
	if (!word || shown.has(word)) return;
	const available = poolCounts(dictionaryAvailableTiles());
	if (!canBuildWord(word, available)) return;
	dictionaryApiTimer = setTimeout(() => renderExactDictionaryWord(query, shown), 360);
}
async function renderExactDictionaryWord(query, shown) {
	const results = document.getElementById('dictionaryResults');
	const search = document.getElementById('dictionarySearch');
	if (!results || !search) return;
	const word = exactDictionaryQuery(query);
	if (!word || shown.has(word)) return;
	const found = await fetchExactDictionaryWord(word);
	if (!found || dictionaryView !== 'possible' || search.value !== query || shown.has(word)) return;
	const frag = document.createDocumentFragment();
	frag.appendChild(dictGroupLabel('Dictionary match'));
	frag.appendChild(dictWordRow(word, null, false));
	results.insertBefore(frag, results.firstChild);
	shown.add(word);
	shown.possibleCount = (shown.possibleCount || 0) + 1;
	setDictionarySearchStatus(shown.possibleCount || 0, shown.relatedCount || 0);
}
async function fetchRelatedWords(query) {
	const q = String(query || '').trim().toLowerCase();
	if (!q) return [];
	if (relatedCache.has(q)) return relatedCache.get(q);
	try {
		const res = await fetch(`${DATAMUSE_URL}?ml=${encodeURIComponent(q)}&max=200`);
		if (!res.ok) throw new Error('Thesaurus request failed');
		const data = await res.json();
		const seen = new Set();
		const words = (Array.isArray(data) ? data : [])
			.map((entry) => String(entry && entry.word ? entry.word : '').toUpperCase())
			.filter((word) => /^[A-Z]{2,17}$/.test(word) && !seen.has(word) && seen.add(word));
		relatedCache.set(q, words);
		return words;
	} catch (e) {
		return [];
	}
}
function scheduleRelatedWords(query, shown) {
	clearTimeout(relatedTimer);
	if (String(query || '').trim().length < 2) return;
	relatedTimer = setTimeout(() => renderRelatedWords(query, shown), 220);
}
async function renderRelatedWords(query, shown) {
	const results = document.getElementById('dictionaryResults');
	const status = document.getElementById('dictionaryStatus');
	const search = document.getElementById('dictionarySearch');
	if (!results || !search) return;
	const related = await fetchRelatedWords(query);
	// Ignore stale responses if the search box changed while we waited.
	if (dictionaryView !== 'possible' || search.value !== query) return;
	const available = poolCounts(dictionaryAvailableTiles());
	const buildable = related
		.filter(
			(word) =>
				word.length > 1 &&
				word.length <= PREVIEW_COLS &&
				!shown.has(word) &&
				canBuildWord(word, available)
		)
		.slice(0, 60);
	if (!buildable.length) {
		shown.relatedCount = 0;
		if (status && !shown.size) setDictionarySearchStatus(shown.possibleCount || 0, 0);
		return;
	}
	const frag = document.createDocumentFragment();
	const label = document.createElement('div');
	label.className = 'dict-group';
	label.textContent = 'Related words';
	frag.appendChild(label);
	for (const word of buildable) frag.appendChild(dictWordRow(word));
	results.appendChild(frag);
	shown.relatedCount = buildable.length;
	if (status) setDictionarySearchStatus(shown.possibleCount || 0, buildable.length);
}
async function openDictionaryModal() {
	const modal = document.getElementById('dictionaryModal');
	const search = document.getElementById('dictionarySearch');
	const status = document.getElementById('dictionaryStatus');
	if (!modal || !search || !status) return;
	status.textContent = 'Loading dictionary...';
	if (!modal.open) modal.showModal();
	search.focus();
	await Promise.all([loadDictionaryWords(), loadCustomWords()]);
	renderDictionaryWords();
}
function bindDictionaryModal() {
	const close = document.getElementById('dictionaryCloseBtn');
	const main = document.getElementById('dictionaryMainBtn');
	const yours = document.getElementById('dictionaryYourWordsBtn');
	const hidden = document.getElementById('dictionaryHiddenWordsBtn');
	const search = document.getElementById('dictionarySearch');
	const modal = document.getElementById('dictionaryModal');
	if (close) close.addEventListener('click', () => modal && modal.close());
	if (main) main.addEventListener('click', () => renderDictionaryWords());
	if (yours) yours.addEventListener('click', renderYourWordsView);
	if (hidden) hidden.addEventListener('click', renderHiddenWordsView);
	if (search)
		search.addEventListener('input', () => {
			if (dictionaryView !== 'possible') return;
			renderDictionaryWords();
		});
	if (modal) {
		modal.addEventListener('click', (e) => {
			if (e.target === modal) modal.close();
		});
	}
}
function openQrShareModal() {
	const modal = document.getElementById('qrShareModal');
	if (!modal) return;
	updateQrShare();
	if (!modal.open) modal.showModal();
}
function bindQrShareModal() {
	const modal = document.getElementById('qrShareModal');
	const close = document.getElementById('qrShareCloseBtn');
	const copy = document.getElementById('copyQrShareBtn');
	if (close) close.addEventListener('click', () => modal && modal.close());
	if (copy) copy.addEventListener('click', (e) => copyShareLink(e.currentTarget));
	if (modal) {
		modal.addEventListener('click', (e) => {
			if (e.target === modal) modal.close();
		});
	}
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
function previewMetaFromSeed(seed, signKey, field, dateKey) {
	const n = Number.isFinite(seed) ? seed >>> 0 : dailyBonusSeed(signKey, field, dateKey);
	return {
		bonusSeed: n,
		bonuses: randomBonusBoard(n),
		score: 0,
		dateKey,
	};
}
function normalizePreviewMeta(raw, signKey, field) {
	const dateKey = typeof (raw && raw.dateKey) === 'string' ? raw.dateKey : localDateKey();
	const seed = Number.isInteger(raw && raw.bonusSeed)
		? raw.bonusSeed >>> 0
		: dailyBonusSeed(signKey, field, dateKey);
	const bonuses = normalizeBonusBoard(raw && raw.bonuses);
	return {
		bonusSeed: seed,
		bonuses: bonuses.some(Boolean) ? bonuses : randomBonusBoard(seed),
		score: Math.max(0, parseInt(raw && raw.score, 10) || 0),
		dateKey,
	};
}
function ensurePreviewMeta(signKey, field) {
	if (!state.preview || typeof state.preview !== 'object') state.preview = {};
	const key = previewKey(signKey, field);
	state.preview[key] = normalizePreviewMeta(state.preview[key], signKey, field);
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
function clearLocalStorage() {
	if (!confirm('WARNING, THIS CLEARS ALL LOCAL STORAGE')) return;
	localStorage.removeItem(STORE_KEY);
	location.reload();
}
function commitCurrentHighScore() {
	if (!state.preview || typeof state.preview !== 'object') return false;
	let changed = false;
	for (const key of Object.keys(state.preview)) {
		changed = commitHighScore(state.preview[key] && state.preview[key].score) || changed;
	}
	return changed;
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
		meta.bonusSeed = dailyBonusSeed(sign.key, 'next', today);
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
function countTileChars(str) {
	// Number of characters that become tiles, matching how the preview places them.
	let n = 0;
	for (const ch of String(str || '').toUpperCase()) {
		if (CHARSET.has(ch)) n++;
	}
	return n;
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
	if (animate === 'all' || animate === 'paste') {
		const delayStep = animate === 'paste' ? 32 : 12;
		const maxDelay = animate === 'paste' ? 520 : 180;
		const duration = animate === 'paste' ? '280ms' : '';
		// On paste, only the pasted run of tiles should animate (not the whole sign).
		const range = animate === 'paste' ? el._pasteRange : null;
		if (el._pasteRange) delete el._pasteRange;
		placedTiles.forEach(({ tile, col }, idx) => {
			if (range && (idx < range.start || idx >= range.start + range.len)) return;
			const seq = range ? idx - range.start : col;
			tile.style.animationDelay = Math.min(seq * delayStep, maxDelay) + 'ms';
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
	const scoreEl = preview.nextElementSibling;
	if (scoreEl && scoreEl.classList.contains('previewscore')) {
		scoreEl.textContent = 'Total score: ' + (meta.score || 0);
	}
	preview.dataset.renderText = text;
	preview.dataset.renderShortSig = shortSig;
	preview.dataset.renderBonusSig = String(meta.bonusSeed || '');
}

function utf8ToBase64Url(text) {
	return bytesToBase64Url(new TextEncoder().encode(text));
}
function bytesToBase64Url(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(text) {
	const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
function base64UrlToUtf8(text) {
	const bytes = base64UrlToBytes(text);
	return new TextDecoder().decode(bytes);
}
function fflateCodec() {
	const codec = window.fflate;
	return codec && codec.deflateSync && codec.inflateSync && codec.strToU8 && codec.strFromU8
		? codec
		: null;
}
function shareWordCounts(raw) {
	const out = {};
	const source = raw && typeof raw === 'object' ? raw : {};
	for (const key in source) {
		const word = String(key).toUpperCase();
		const n = parseInt(source[key], 10);
		if (/^[A-Z]{2,17}$/.test(word) && n > 0) out[word] = n;
	}
	return out;
}
function shareTextValue(text) {
	return String(text || '').slice(0, SHARE_TEXT_MAX_LENGTH);
}
function sortedVisibleWordUses() {
	const uses = shareWordCounts(state.wordUses);
	const hidden = shareWordCounts(state.hiddenWords);
	return Object.entries(uses)
		.filter(([word, count]) => count >= 2 && !hidden[word])
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function sortedHiddenWords() {
	return Object.entries(shareWordCounts(state.hiddenWords)).sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
	);
}
function packWordCounts(raw) {
	return Object.entries(shareWordCounts(raw))
		.map(([word, count]) => word + ':' + count.toString(36))
		.join('|');
}
function unpackWordCounts(raw) {
	if (!raw) return {};
	if (typeof raw === 'object') return shareWordCounts(raw);
	const out = {};
	for (const item of String(raw).split('|')) {
		if (!item) continue;
		const parts = item.split(':');
		const word = String(parts[0] || '').toUpperCase();
		const n = parseInt(parts[1] || '', 36);
		if (/^[A-Z]{2,17}$/.test(word) && n > 0) out[word] = n;
	}
	return out;
}
function mergeWordCounts(target, incoming) {
	const out = target && typeof target === 'object' ? target : {};
	const next = unpackWordCounts(incoming);
	for (const word in next) out[word] = Math.max(parseInt(out[word], 10) || 0, next[word]);
	return out;
}
function mapFromEntries(entries) {
	return Object.fromEntries(entries);
}
function sharePayload(wordUses, hiddenWords) {
	const dateKey = localDateKey();
	return {
		a: 's',
		v: 3,
		t: new Date().toISOString(),
		h: Math.max(0, parseInt(state.highScore, 10) || 0),
		w: packWordCounts(wordUses),
		x: packWordCounts(hiddenWords),
		s: SIGNS.map((sign) => {
			const t = txt(sign.key);
			return [
				sign.key,
				shareTextValue(t.now),
				shareTextValue(t.next),
				ensurePreviewMeta(sign.key, 'now').bonusSeed >>> 0,
				ensurePreviewMeta(sign.key, 'next').bonusSeed >>> 0,
			];
		}),
		d: dateKey,
	};
}
function shareCodeForPayload(payload) {
	const json = JSON.stringify(payload);
	const rawCode = utf8ToBase64Url(json);
	const codec = fflateCodec();
	if (codec) {
		try {
			const compressedCode =
				'z.' + bytesToBase64Url(codec.deflateSync(codec.strToU8(json), { level: 9 }));
			if (compressedCode.length < rawCode.length) return compressedCode;
		} catch (e) {}
	}
	return rawCode;
}
function shareUrlLengthForCode(code) {
	return window.location.href.replace(/#.*$/, '').length + '#share='.length + code.length;
}
function budgetedSharePayload() {
	const saved = sortedVisibleWordUses();
	const hidden = sortedHiddenWords();
	const fits = (savedCount, hiddenCount) =>
		shareUrlLengthForCode(
			shareCodeForPayload(
				sharePayload(
					mapFromEntries(saved.slice(0, savedCount)),
					mapFromEntries(hidden.slice(0, hiddenCount))
				)
			)
		) <= SHARE_URL_TARGET_LENGTH;
	function maxCount(total, isFit) {
		let low = 0;
		let high = total;
		while (low < high) {
			const mid = Math.ceil((low + high) / 2);
			if (isFit(mid)) low = mid;
			else high = mid - 1;
		}
		return low;
	}
	const pairedCount = maxCount(Math.min(saved.length, hidden.length), (count) =>
		fits(count, count)
	);
	let savedCount = pairedCount;
	let hiddenCount = pairedCount;
	while (savedCount < saved.length || hiddenCount < hidden.length) {
		const tryHidden =
			hiddenCount < hidden.length && (hiddenCount <= savedCount || savedCount >= saved.length);
		const nextSaved = savedCount + (tryHidden ? 0 : 1);
		const nextHidden = hiddenCount + (tryHidden ? 1 : 0);
		if (!fits(nextSaved, nextHidden)) break;
		savedCount = nextSaved;
		hiddenCount = nextHidden;
	}
	return sharePayload(
		mapFromEntries(saved.slice(0, savedCount)),
		mapFromEntries(hidden.slice(0, hiddenCount))
	);
}
function shareCode() {
	return shareCodeForPayload(budgetedSharePayload());
}
function shareUrl() {
	const base = window.location.href.replace(/#.*$/, '');
	return base + '#share=' + shareCode();
}
function decodeShare(input) {
	const raw = String(input || '').trim();
	const match = raw.match(/(?:^|[#&?])share=([^&\s]+)/);
	const code = match ? match[1] : raw;
	let json;
	if (code.startsWith('z.')) {
		const codec = fflateCodec();
		if (!codec) throw new Error('Compressed share payload is not supported');
		json = codec.strFromU8(codec.inflateSync(base64UrlToBytes(code.slice(2))));
	} else {
		json = base64UrlToUtf8(code);
	}
	const data = JSON.parse(json);
	if (data && data.a === 's' && Array.isArray(data.s)) {
		return {
			app: 'sign_swap',
			version: data.v || 3,
			savedAt: data.t || '',
			highScore: data.h || 0,
			wordUses: unpackWordCounts(data.w),
			hiddenWords: unpackWordCounts(data.x),
			signs: data.s.map((item) => ({
				key: item && item[0],
				now: item && item[1],
				next: item && item[2],
				nowSeed: item && item[3],
				nextSeed: item && item[4],
			})),
			dateKey: data.d,
		};
	}
	if (!data || data.app !== 'sign_swap' || !Array.isArray(data.signs)) {
		throw new Error('Invalid share payload');
	}
	return data;
}
function applyShare(data, rebind) {
	const dateKey = typeof data.dateKey === 'string' ? data.dateKey : localDateKey();
	if (!state.text || typeof state.text !== 'object') state.text = {};
	if (!state.preview || typeof state.preview !== 'object') state.preview = {};
	state.highScore = Math.max(state.highScore || 0, parseInt(data.highScore, 10) || 0);
	state.wordUses = mergeWordCounts(state.wordUses, data.wordUses);
	state.hiddenWords = mergeWordCounts(state.hiddenWords, data.hiddenWords);
	updateHighScoreBadge(false);
	invalidateDictionaryAvailability();
	for (const sign of SIGNS) {
		const incoming = data.signs.find((item) => item && item.key === sign.key) || {};
		state.text[sign.key] = {
			now: String(incoming.now || ''),
			next: String(incoming.next || ''),
		};
		for (const field of ['now', 'next']) {
			const seedKey = field + 'Seed';
			state.preview[previewKey(sign.key, field)] = previewMetaFromSeed(
				parseInt(incoming[seedKey], 10),
				sign.key,
				field,
				dateKey
			);
		}
	}
	saveState();
	buildEntry();
	if (rebind !== false) bindEntryActions();
	calculate();
	updateQrShare();
}
function updateQrShare() {
	const img = document.getElementById('qrShareImg');
	const link = document.getElementById('qrShareLink');
	if (!img && !link) return;
	const url = shareUrl();
	if (link) link.value = url;
	if (img) {
		const src =
			'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=' +
			encodeURIComponent(url);
		if (img.src !== src) img.src = src;
	}
}
function copyShareLink(btn) {
	const url = shareUrl();
	const done = () => {
		if (!btn) return;
		const old = btn.textContent;
		btn.textContent = 'Copied';
		btn.classList.add('copied');
		setTimeout(() => {
			btn.textContent = old;
			btn.classList.remove('copied');
		}, 900);
	};
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
	} else {
		fallbackCopy(url, done);
	}
}
function promptImportShare() {
	const raw = prompt('Paste a Sign Swap phone link or share code:');
	if (!raw) return;
	try {
		applyShare(decodeShare(raw));
		setLoadStatus('Loaded phone link.', 'good');
	} catch (e) {
		setLoadStatus('Could not read that phone link.', 'bad');
	}
}
function importShareFromHash() {
	const match = window.location.hash.match(/(?:^#|&)share=([^&]+)/);
	if (!match) return false;
	try {
		applyShare(decodeShare(match[1]), false);
		history.replaceState(null, '', window.location.href.replace(/#.*$/, ''));
		setLoadStatus('Loaded phone link.', 'good');
		return true;
	} catch (e) {
		setLoadStatus('Could not read the phone link.', 'bad');
		return false;
	}
}

/* counting */
function countText(text, counts, unknown) {
	for (const ch of (text || '').toUpperCase()) {
		if (CHARSET.has(ch)) counts[ch] = (counts[ch] || 0) + 1;
		else if (ch.trim() !== '' && !SILENT_CHARS.has(ch)) unknown.add(ch);
	}
}
function textCounts(id, text) {
	const value = String(text || '');
	const cached = textCountCache.get(id);
	if (cached && cached.value === value) return cached;
	const counts = {};
	const unknown = new Set();
	countText(value, counts, unknown);
	const next = { value, counts, unknown };
	textCountCache.set(id, next);
	return next;
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
	const dictionary = document.createElement('button');
	dictionary.type = 'button';
	dictionary.className = 'ghost';
	dictionary.id = 'dictionaryBtn';
	dictionary.textContent = 'Dictionary';
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
	const phone = document.createElement('button');
	phone.type = 'button';
	phone.className = 'ghost';
	phone.id = 'phoneLinkBtn';
	phone.textContent = 'QR';
	actions.appendChild(phone);
	actions.appendChild(dictionary);
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
	const scoreEl = document.createElement('div');
	scoreEl.className = 'previewscore';
	const meta = ensurePreviewMeta(signKey, field);
	fillTilePreview(preview, ta.value, null, false, meta);
	scoreEl.textContent = 'Total score: ' + (meta.score || 0);
	ta.addEventListener('focus', warmAudio);
	ta.addEventListener('pointerdown', warmAudio);
	ta.addEventListener('input', (e) => {
		txt(signKey)[field] = ta.value;
		if (!preview.dataset.animateNext && e.inputType === 'insertText') {
			const ch = (e.data || '').toUpperCase();
			if (CHARSET.has(ch)) preview.dataset.animateNext = '1';
		}
		const animate = preview.dataset.animateNext;
		delete preview.dataset.animateNext;
		renderInputPreview(preview, ta.value, signKey, field, animate);
		scheduleCalculate();
		scheduleSaveState();
		scheduleQrRefresh();
	});
	ta.addEventListener('keydown', (e) => {
		if (handleSelectionDelete(e, ta, preview, signKey, field)) return;
		playTileSound(e);
	});
	ta.addEventListener('cut', (e) => {
		handleCut(e, ta, preview, signKey, field);
	});
	ta.addEventListener('paste', (e) => {
		const start = ta.selectionStart || 0;
		const pasted = e.clipboardData ? e.clipboardData.getData('text') : '';
		// Tiles before the cursor are unchanged; the pasted text's tiles start there.
		preview._pasteRange = {
			start: countTileChars(ta.value.slice(0, start)),
			len: countTileChars(pasted),
		};
		preview.dataset.animateNext = 'paste';
		playPasteSound(e);
	});
	col.appendChild(l);
	col.appendChild(ta);
	col.appendChild(preview);
	col.appendChild(scoreEl);
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
function playHoverClack() {
	playTileClacks(1);
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
		ta.value = text.slice(0, start) + text.slice(end);
		ta.setSelectionRange(start, start);
		txt(signKey)[field] = ta.value;
		renderInputPreview(preview, ta.value, signKey, field, false);
		scheduleCalculate(0);
		scheduleSaveState(0);
	}
}
function handleSelectionDelete(e, ta, preview, signKey, field) {
	if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
	const start = ta.selectionStart || 0;
	const end = ta.selectionEnd || 0;
	if (start === end) return false;
	e.preventDefault();
	const text = ta.value;
	playTextChangeSound(text.slice(start, end));
	animateCutSelection(preview, text, start, end);
	ta.value = text.slice(0, start) + text.slice(end);
	ta.setSelectionRange(start, start);
	txt(signKey)[field] = ta.value;
	renderInputPreview(preview, ta.value, signKey, field, false);
	scheduleCalculate(0);
	scheduleSaveState(0);
	return true;
}
function animateCutSelection(preview, text, start, end) {
	for (const pos of previewPositionsForRange(text, start, end)) {
		const row = preview.querySelectorAll('.previewline')[pos.row];
		const tile = row && row.children[pos.col] && row.children[pos.col].querySelector('.tile');
		if (!tile) continue;
		const rect = tile.getBoundingClientRect();
		const clone = tile.cloneNode(true);
		const delay = Math.min(pos.col * 32, 520);
		clone.classList.add('tile-cutclone', 'cutout');
		clone.style.position = 'fixed';
		clone.style.left = rect.left + 'px';
		clone.style.top = rect.top + 'px';
		clone.style.width = rect.width + 'px';
		clone.style.height = rect.height + 'px';
		clone.style.animationDelay = delay + 'ms';
		clone.style.animationDuration = '280ms';
		document.body.appendChild(clone);
		setTimeout(() => clone.remove(), delay + 360);
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
		tile.addEventListener('pointerenter', playHoverClack);
		const i = document.createElement('input');
		i.type = 'text';
		i.inputMode = 'numeric';
		i.value = I[ch] || 0;
		i.addEventListener('input', () => {
			let n = parseInt(i.value, 10);
			if (isNaN(n) || n < 0) n = 0;
			I[ch] = n;
			invalidateDictionaryAvailability();
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
		const nowData = textCounts(previewKey(sign.key, 'now'), t.now);
		const nextData = textCounts(previewKey(sign.key, 'next'), t.next);
		const now = nowData.counts;
		const next = nextData.counts;
		for (const ch of nowData.unknown) unknown.add(ch);
		for (const ch of nextData.unknown) unknown.add(ch);
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
		const scoreEl = preview.nextElementSibling;
		if (scoreEl && scoreEl.classList.contains('previewscore')) {
			scoreEl.textContent = 'Total score: ' + (meta.score || 0);
		}
	});

	// Step 1 bring
	const bringEl = document.getElementById('bringTiles');
	if (setSig(bringEl, mapSig(bring) + '|' + [...shortInfo].map(([k, v]) => `${k}:${v.need}`).join(','))) {
		if (!fillTiles(bringEl, bring, shortInfo))
			bringEl.innerHTML = '<div class="empty">Nothing new to bring.</div>';
	}

	// Step 2 swap
	const swapEl = document.getElementById('swapTiles');
	const swapSig = perSign.map((s) => s.label + ':' + mapSig(s.swap)).join('|');
	if (setSig(swapEl, swapSig)) {
		swapEl.innerHTML = '';
		swapEl.className = 'swapgrid';
		let hasSwap = false;
		const frag = document.createDocumentFragment();
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
			frag.appendChild(blk);
		}
		if (hasSwap) {
			swapEl.appendChild(frag);
		} else {
			swapEl.className = 'tiles';
			swapEl.innerHTML = '<div class="empty">No cross-sign swaps.</div>';
		}
	}

	// Step 3 per sign
	const ps = document.getElementById('perSign');
	const perSignSig = perSign
		.map((s) => [s.label, mapSig(s.take), mapSig(s.swap), mapSig(s.put)].join(':'))
		.join('|');
	if (setSig(ps, perSignSig)) {
		ps.innerHTML = '';
		const frag = document.createDocumentFragment();
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
			frag.appendChild(blk);
		}
		ps.appendChild(frag);
	}

	// leftover
	const left = {};
	for (const ch of CHARS) {
		if (tileKey(ch) !== ch) continue;
		const v = (poolInv[ch] || 0) + (poolCurrent[ch] || 0) - (poolDeployed[ch] || 0);
		if (v > 0) left[ch] = v;
	}
	const leftSig = mapSig(left);
	if (mapSig(currentBoxLeft || {}) !== leftSig) {
		currentBoxLeft = left;
		invalidateDictionaryAvailability();
		const modal = document.getElementById('dictionaryModal');
		if (modal && modal.open) renderCurrentDictionaryView();
	}
	const leftEl = document.getElementById('leftTiles');
	if (setSig(leftEl, leftSig)) {
		if (!fillTiles(leftEl, left, null))
			leftEl.innerHTML = '<div class="empty">Box is empty after this change.</div>';
	}

	// alert
	renderShortageAlert(shortages);

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
function renderShortageAlert(shortages) {
	const alertSlot = document.getElementById('alertSlot');
	if (!shortages.length) {
		if (alertSlot.firstChild) alertSlot.replaceChildren();
		return;
	}
	let div = alertSlot.querySelector('.alertbar');
	let list;
	if (!div) {
		div = document.createElement('div');
		div.className = 'alertbar';
		const title = document.createElement('strong');
		title.textContent = 'Not enough tiles.';
		div.appendChild(title);
		div.appendChild(
			document.createTextNode(' The box does not hold enough tiles for this change.')
		);
		list = document.createElement('div');
		list.className = 'shortagelist';
		div.appendChild(list);
		const note = document.createElement('div');
		note.className = 'shortagenote';
		note.textContent = 'The red tiles are the ones you are short on.';
		div.appendChild(note);
		alertSlot.replaceChildren(div);
	} else {
		list = div.querySelector('.shortagelist');
	}
	const rows = new Map();
	for (const row of list.children) rows.set(row.dataset.shortageKey, row);
	const seen = new Set();
	for (const s of shortages) {
		seen.add(s.ch);
		let row = rows.get(s.ch);
		if (!row) {
			row = document.createElement('div');
			row.className = 'shortagerow';
			row.dataset.shortageKey = s.ch;
			for (let i = 0; i < 3; i++) row.appendChild(document.createElement('span'));
			list.appendChild(row);
		}
		row.children[0].textContent = s.ch;
		row.children[1].textContent = `need ${s.need}`;
		row.children[2].textContent = `have ${s.have}`;
	}
	for (const [key, row] of rows) {
		if (!seen.has(key)) row.remove();
	}
}
function tileRow(label, cls, map) {
	const row = document.createElement('div');
	row.className = 'tilerow';
	const l = document.createElement('span');
	l.className = 'rowlab ' + cls;
	l.textContent = label;
	row.appendChild(l);
	const frag = document.createDocumentFragment();
	let any = false;
	for (const ch of CHARS) {
		const n = map[ch] || 0;
		if (n > 0) {
			frag.appendChild(tileCount(ch, n, false));
			any = true;
		}
	}
	row.appendChild(frag);
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
		invalidateDictionaryAvailability();
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
	document.getElementById('dictionaryBtn').addEventListener('click', openDictionaryModal);
	document.getElementById('phoneLinkBtn').addEventListener('click', openQrShareModal);
	updateQrShare();
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
		recordUsedWords(currentSignTexts());
		for (const sign of SIGNS) {
			const t = txt(sign.key);
			const nextMeta = ensurePreviewMeta(sign.key, 'next');
			commitHighScore(nextMeta.score);
			t.now = t.next;
			t.next = '';
			if (!state.preview || typeof state.preview !== 'object') state.preview = {};
			const nowKey = previewKey(sign.key, 'now');
			const nextKey = previewKey(sign.key, 'next');
			state.preview[nowKey] = normalizePreviewMeta(nextMeta, sign.key, 'now');
			state.preview[nextKey] = normalizePreviewMeta(null, sign.key, 'next');
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
	commitCurrentHighScore();
	recordUsedWords(currentSignTexts());
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
			invalidateDictionaryAvailability();
			saveState();
			buildEntry();
			bindEntryActions();
			buildInv();
			calculate();
			updateQrShare();
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
	const next = { inv: {}, text: {}, preview: {}, highScore: 0, wordUses: {}, hiddenWords: {} };
	next.highScore = Math.max(0, parseInt(raw.highScore, 10) || 0);
	const rawUses = raw.wordUses && typeof raw.wordUses === 'object' ? raw.wordUses : {};
	for (const key in rawUses) {
		const word = String(key).toUpperCase();
		const n = parseInt(rawUses[key], 10);
		if (/^[A-Z]{2,17}$/.test(word) && n > 0) next.wordUses[word] = n;
	}
	const rawHidden = raw.hiddenWords && typeof raw.hiddenWords === 'object' ? raw.hiddenWords : {};
	for (const key in rawHidden) {
		const word = String(key).toUpperCase();
		const n = parseInt(rawHidden[key], 10);
		if (/^[A-Z]{2,17}$/.test(word) && rawHidden[key]) next.hiddenWords[word] = n > 0 ? n : 1;
	}
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
			next.preview[key] = normalizePreviewMeta(rawPreview[key] || legacyMeta, sign.key, field);
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
	loadStopWords(); // background; word-learning happens later on user actions
	loadCustomWords(); // background; premade "Your words" seeds
	const saved = loadState();
	if (saved) {
		state = normalizeLoadedState(saved);
	}
	rotateNextPreviewBonusesIfNeeded();
	const loadedSharedState = importShareFromHash();
	buildWordmark();
	loadTaglineQuote();
	if (!loadedSharedState) buildEntry();
	buildInv();
	updateHighScoreBadge(false);
	calculate();

	bindEntryActions();
	bindDictionaryModal();
	bindQrShareModal();
	document.getElementById('exportBtn').addEventListener('click', exportCSV);
	document.getElementById('importInput').addEventListener('change', (e) => {
		if (e.target.files[0]) importCSV(e.target.files[0]);
		e.target.value = '';
	});
	document.getElementById('resetInvBtn').addEventListener('click', () => {
		if (confirm('Reset inventory to the original counts?')) {
			state.inv = Object.assign({}, DEFAULT_INV);
			invalidateDictionaryAvailability();
			saveState();
			buildInv();
			calculate();
		}
	});
	document.getElementById('randomizeBonusesBtn').addEventListener('click', randomizePreviewBonuses);
	document.getElementById('clearHighScoreBtn').addEventListener('click', clearHighScore);
	document.getElementById('clearStorageBtn').addEventListener('click', clearLocalStorage);
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
