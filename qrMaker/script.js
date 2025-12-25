"use strict";
const qrcodegen = {};

/* ---------- Helpers ---------- */
function assert(cond) { if (!cond) throw new Error('Assertion error'); }
function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
function appendBits(val, len, bb) {
	if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
	for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

/* ---- QrCode ---- */
class QrCode {
	constructor(version, errorCorrectionLevel, dataCodewords, msk) {
		this.version = version;
		this.errorCorrectionLevel = errorCorrectionLevel;
		this.modules = [];
		this.isFunction = [];

		if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION) throw new RangeError('Version value out of range');
		if (msk < -1 || msk > 7) throw new RangeError('Mask value out of range');

		this.size = version * 4 + 17;
		for (let i = 0; i < this.size; i++) {
			this.modules.push(new Array(this.size).fill(false));
			this.isFunction.push(new Array(this.size).fill(false));
		}

		this.drawFunctionPatterns();
		const allCodewords = this.addEccAndInterleave(dataCodewords);
		this.drawCodewords(allCodewords);

		if (msk === -1) {
			let minPenalty = Infinity;
			for (let i = 0; i < 8; i++) {
				this.applyMask(i); this.drawFormatBits(i);
				const penalty = this.getPenaltyScore();
				if (penalty < minPenalty) { msk = i; minPenalty = penalty; }
				this.applyMask(i);
			}
		}

		assert(0 <= msk && msk <= 7);
		this.mask = msk;
		this.applyMask(msk);
		this.drawFormatBits(msk);
		this.isFunction = [];
	}

	static encodeText(text, ecl) { return QrCode.encodeSegments(qrcodegen.QrSegment.makeSegments(text), ecl); }
	static encodeBinary(data, ecl) { return QrCode.encodeSegments([qrcodegen.QrSegment.makeBytes(data)], ecl); }

	static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
		if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION) || mask < -1 || mask > 7) throw new RangeError('Invalid value');

		let version, dataUsedBits;
		for (version = minVersion;; version++) {
			const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
			const usedBits = qrcodegen.QrSegment.getTotalBits(segs, version);
			if (usedBits <= dataCapacityBits) { dataUsedBits = usedBits; break; }
			if (version >= maxVersion) throw new RangeError('Data too long');
		}

		for (const newEcl of [QrCode.Ecc.MEDIUM, QrCode.Ecc.QUARTILE, QrCode.Ecc.HIGH]) {
			if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
		}

		const bb = [];
		for (const seg of segs) {
			appendBits(seg.mode.modeBits, 4, bb);
			appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
			for (const b of seg.getData()) bb.push(b);
		}

		assert(bb.length === dataUsedBits);
		const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
		assert(bb.length <= dataCapacityBits);
		appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
		appendBits(0, (8 - bb.length % 8) % 8, bb);
		assert(bb.length % 8 === 0);
		for (let pad = 0xEC; bb.length < dataCapacityBits; pad ^= 0xEC ^ 0x11) appendBits(pad, 8, bb);

		const dataCodewords = new Array(Math.ceil(bb.length / 8)).fill(0);
		bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << (7 - (i & 7)));
		return new QrCode(version, ecl, dataCodewords, mask);
	}

	getModule(x, y) { return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x]; }

	drawFunctionPatterns() {
		for (let i = 0; i < this.size; i++) { this.setFunctionModule(6, i, i % 2 === 0); this.setFunctionModule(i, 6, i % 2 === 0); }
		this.drawFinderPattern(3, 3); this.drawFinderPattern(this.size - 4, 3); this.drawFinderPattern(3, this.size - 4);
		const align = this.getAlignmentPatternPositions();
		for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) if (!(i === 0 && j === 0 || i === 0 && j === align.length - 1 || i === align.length - 1 && j === 0)) this.drawAlignmentPattern(align[i], align[j]);
		this.drawFormatBits(0); this.drawVersion();
	}

	drawFormatBits(mask) {
		const data = this.errorCorrectionLevel.formatBits << 3 | mask;
		let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
		const bits = (data << 10 | rem) ^ 0x5412; assert(bits >>> 15 === 0);

		for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
		this.setFunctionModule(8, 7, getBit(bits, 6)); this.setFunctionModule(8, 8, getBit(bits, 7)); this.setFunctionModule(7, 8, getBit(bits, 8));
		for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));
		for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
		for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
		this.setFunctionModule(8, this.size - 8, true);
	}

	drawVersion() {
		if (this.version < 7) return;
		let rem = this.version; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
		const bits = this.version << 12 | rem; assert(bits >>> 18 === 0);
		for (let i = 0; i < 18; i++) { const color = getBit(bits, i); const a = this.size - 11 + i % 3; const b = Math.floor(i / 3); this.setFunctionModule(a, b, color); this.setFunctionModule(b, a, color); }
	}

	drawFinderPattern(x, y) { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const dist = Math.max(Math.abs(dx), Math.abs(dy)); const xx = x + dx; const yy = y + dy; if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size) this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4); } }
	drawAlignmentPattern(x, y) { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
	setFunctionModule(x, y, isDark) { this.modules[y][x] = isDark; this.isFunction[y][x] = true; }

	addEccAndInterleave(data) {
		const ver = this.version, ecl = this.errorCorrectionLevel;
		if (data.length !== QrCode.getNumDataCodewords(ver, ecl)) throw new RangeError('Invalid argument');
		const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
		const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
		const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
		const numShortBlocks = numBlocks - rawCodewords % numBlocks;
		const shortBlockLen = Math.floor(rawCodewords / numBlocks);

		const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
		const blocks = [];
		for (let i = 0, k = 0; i < numBlocks; i++) {
			let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)); k += dat.length;
			const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
			if (i < numShortBlocks) dat.push(0);
			blocks.push(dat.concat(ecc));
		}

		const result = [];
		for (let i = 0; i < blocks[0].length; i++) blocks.forEach((block, j) => { if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]); });
		assert(result.length === rawCodewords); return result;
	}

	drawCodewords(data) {
		if (data.length !== Math.floor(QrCode.getNumRawDataModules(this.version) / 8)) throw new RangeError('Invalid argument');
		let i = 0;
		for (let right = this.size - 1; right >= 1; right -= 2) {
			if (right === 6) right = 5;
			for (let vert = 0; vert < this.size; vert++) for (let j = 0; j < 2; j++) {
				const x = right - j; const upward = ((right + 1) & 2) === 0; const y = upward ? this.size - 1 - vert : vert;
				if (!this.isFunction[y][x] && i < data.length * 8) { this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7)); i++; }
			}
		}
		assert(i === data.length * 8);
	}

	applyMask(mask) {
		if (mask < 0 || mask > 7) throw new RangeError('Mask value out of range');
		for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
			let invert;
			switch (mask) {
				case 0: invert = (x + y) % 2 === 0; break;
				case 1: invert = y % 2 === 0; break;
				case 2: invert = x % 3 === 0; break;
				case 3: invert = (x + y) % 3 === 0; break;
				case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
				case 5: invert = x * y % 2 + x * y % 3 === 0; break;
				case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
				default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
			}
			if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
		}
	}

	getPenaltyScore() {
		let result = 0;
		for (let y = 0; y < this.size; y++) {
			let runColor = false, runLen = 0, history = [0,0,0,0,0,0,0];
			for (let x = 0; x < this.size; x++) {
				if (this.modules[y][x] === runColor) { runLen++; if (runLen === 5) result += QrCode.PENALTY_N1; else if (runLen > 5) result++; }
				else { this.finderPenaltyAddHistory(runLen, history); if (!runColor) result += this.finderPenaltyCountPatterns(history) * QrCode.PENALTY_N3; runColor = this.modules[y][x]; runLen = 1; }
			}
			result += this.finderPenaltyTerminateAndCount(runColor, runLen, history) * QrCode.PENALTY_N3;
		}

		for (let x = 0; x < this.size; x++) {
			let runColor = false, runLen = 0, history = [0,0,0,0,0,0,0];
			for (let y = 0; y < this.size; y++) {
				if (this.modules[y][x] === runColor) { runLen++; if (runLen === 5) result += QrCode.PENALTY_N1; else if (runLen > 5) result++; }
				else { this.finderPenaltyAddHistory(runLen, history); if (!runColor) result += this.finderPenaltyCountPatterns(history) * QrCode.PENALTY_N3; runColor = this.modules[y][x]; runLen = 1; }
			}
			result += this.finderPenaltyTerminateAndCount(runColor, runLen, history) * QrCode.PENALTY_N3;
		}

		for (let y = 0; y < this.size - 1; y++) for (let x = 0; x < this.size - 1; x++) { const c = this.modules[y][x]; if (c === this.modules[y][x+1] && c === this.modules[y+1][x] && c === this.modules[y+1][x+1]) result += QrCode.PENALTY_N2; }

		let dark = 0; for (const row of this.modules) dark = row.reduce((s, c) => s + (c ? 1 : 0), dark);
		const total = this.size * this.size; const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1; assert(0 <= k && k <= 9);
		result += k * QrCode.PENALTY_N4; assert(0 <= result && result <= 2568888);
		return result;
	}

	getAlignmentPatternPositions() {
		if (this.version === 1) return [];
		const numAlign = Math.floor(this.version / 7) + 2;
		const step = (this.version === 32) ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
		const res = [6];
		for (let pos = this.size - 7; res.length < numAlign; pos -= step) res.splice(1, 0, pos);
		return res;
	}

	static getNumRawDataModules(ver) {
		if (ver < QrCode.MIN_VERSION || ver > QrCode.MAX_VERSION) throw new RangeError('Version number out of range');
		let result = (16 * ver + 128) * ver + 64;
		if (ver >= 2) { const numAlign = Math.floor(ver / 7) + 2; result -= (25 * numAlign - 10) * numAlign - 55; if (ver >= 7) result -= 36; }
		assert(208 <= result && result <= 29648); return result;
	}

	static getNumDataCodewords(ver, ecl) { return Math.floor(QrCode.getNumRawDataModules(ver) / 8) - QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]; }

	static reedSolomonComputeDivisor(degree) {
		if (degree < 1 || degree > 255) throw new RangeError('Degree out of range');
		const result = new Array(degree - 1).fill(0); result.push(1);
		let root = 1;
		for (let i = 0; i < degree; i++) {
			for (let j = 0; j < result.length; j++) { result[j] = QrCode.reedSolomonMultiply(result[j], root); if (j + 1 < result.length) result[j] ^= result[j + 1]; }
			root = QrCode.reedSolomonMultiply(root, 0x02);
		}
		return result;
	}

	static reedSolomonComputeRemainder(data, divisor) {
		const result = divisor.map(() => 0);
		for (const b of data) { const factor = b ^ result.shift(); result.push(0); divisor.forEach((coef, i) => result[i] ^= QrCode.reedSolomonMultiply(coef, factor)); }
		return result;
	}

	static reedSolomonMultiply(x, y) {
		if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError('Byte out of range');
		let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
		assert(z >>> 8 === 0); return z;
	}

	finderPenaltyCountPatterns(runHistory) {
		const n = runHistory[1]; assert(n <= this.size * 3);
		const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
		return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
	}

	finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
		if (currentRunColor) { this.finderPenaltyAddHistory(currentRunLength, runHistory); currentRunLength = 0; }
		currentRunLength += this.size; this.finderPenaltyAddHistory(currentRunLength, runHistory); return this.finderPenaltyCountPatterns(runHistory);
	}

	finderPenaltyAddHistory(currentRunLength, runHistory) {
		if (runHistory[0] === 0) currentRunLength += this.size;
		runHistory.pop(); runHistory.unshift(currentRunLength);
	}
}

QrCode.MIN_VERSION = 1; QrCode.MAX_VERSION = 40; QrCode.PENALTY_N1 = 3; QrCode.PENALTY_N2 = 3; QrCode.PENALTY_N3 = 40; QrCode.PENALTY_N4 = 10;
QrCode.ECC_CODEWORDS_PER_BLOCK = [
	[-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30],
	[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
	[-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30],
	[-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
];
QrCode.NUM_ERROR_CORRECTION_BLOCKS = [
	[-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
	[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
	[-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
	[-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
];

qrcodegen.QrCode = QrCode;

/* ---- QrSegment ---- */
class QrSegment {
	constructor(mode, numChars, bitData) { this.mode = mode; this.numChars = numChars; if (numChars < 0) throw new RangeError('Invalid argument'); this.bitData = bitData.slice(); }
	static makeBytes(data) { const bb = []; for (const b of data) appendBits(b, 8, bb); return new QrSegment(QrSegment.Mode.BYTE, data.length, bb); }
	static makeNumeric(digits) { if (!QrSegment.isNumeric(digits)) throw new RangeError('String contains non-numeric characters'); const bb = []; for (let i = 0; i < digits.length;) { const n = Math.min(digits.length - i, 3); appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb); i += n; } return new QrSegment(QrSegment.Mode.NUMERIC, digits.length, bb); }
	static makeAlphanumeric(text) { if (!QrSegment.isAlphanumeric(text)) throw new RangeError('String contains unencodable characters in alphanumeric mode'); const bb = []; let i; for (i = 0; i + 2 <= text.length; i += 2) { let temp = QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45; temp += QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1)); appendBits(temp, 11, bb); } if (i < text.length) appendBits(QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb); return new QrSegment(QrSegment.Mode.ALPHANUMERIC, text.length, bb); }
	static makeSegments(text) { if (text === '') return []; else if (QrSegment.isNumeric(text)) return [QrSegment.makeNumeric(text)]; else if (QrSegment.isAlphanumeric(text)) return [QrSegment.makeAlphanumeric(text)]; else return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))]; }
	static makeEci(assignVal) { const bb = []; if (assignVal < 0) throw new RangeError('ECI assignment value out of range'); else if (assignVal < (1 << 7)) appendBits(assignVal, 8, bb); else if (assignVal < (1 << 14)) { appendBits(0b10, 2, bb); appendBits(assignVal, 14, bb); } else if (assignVal < 1000000) { appendBits(0b110, 3, bb); appendBits(assignVal, 21, bb); } else throw new RangeError('ECI assignment value out of range'); return new QrSegment(QrSegment.Mode.ECI, 0, bb); }
	static isNumeric(text) { return QrSegment.NUMERIC_REGEX.test(text); }
	static isAlphanumeric(text) { return QrSegment.ALPHANUMERIC_REGEX.test(text); }
	getData() { return this.bitData.slice(); }
	static getTotalBits(segs, version) { let res = 0; for (const seg of segs) { const ccbits = seg.mode.numCharCountBits(version); if (seg.numChars >= (1 << ccbits)) return Infinity; res += 4 + ccbits + seg.bitData.length; } return res; }
	static toUtf8ByteArray(str) { str = encodeURI(str); const result = []; for (let i = 0; i < str.length; i++) { if (str.charAt(i) !== '%') result.push(str.charCodeAt(i)); else { result.push(parseInt(str.substring(i + 1, i + 3), 16)); i += 2; } } return result; }
}
QrSegment.NUMERIC_REGEX = /^[0-9]*$/;
QrSegment.ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/;
QrSegment.ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
qrcodegen.QrSegment = QrSegment;

/* ---- Public enums ---- */
class Ecc { constructor(ordinal, formatBits) { this.ordinal = ordinal; this.formatBits = formatBits; } }
Ecc.LOW = new Ecc(0, 1); Ecc.MEDIUM = new Ecc(1, 0); Ecc.QUARTILE = new Ecc(2, 3); Ecc.HIGH = new Ecc(3, 2);
qrcodegen.QrCode.Ecc = Ecc;

class Mode { constructor(modeBits, numBitsCharCount) { this.modeBits = modeBits; this.numBitsCharCount = numBitsCharCount; } numCharCountBits(ver) { return this.numBitsCharCount[Math.floor((ver + 7) / 17)]; } }
Mode.NUMERIC = new Mode(0x1, [10,12,14]); Mode.ALPHANUMERIC = new Mode(0x2, [9,11,13]); Mode.BYTE = new Mode(0x4, [8,16,16]); Mode.KANJI = new Mode(0x8, [8,10,12]); Mode.ECI = new Mode(0x7, [0,0,0]);
qrcodegen.QrSegment.Mode = Mode;

/* ---------- Minimal UI ---------- */
const INP_ID = 'qrInput', CANVAS_ID = 'qrCanvas', RESULT_ID = 'result', DOWNLOAD_ID = 'downloadBtn';
const BORDER = 4, MIN_CSS = 256, MIN_MODULE_PX = 4, MAX_MODULE_PX = 64, DEBOUNCE = 100;

const inp = document.getElementById(INP_ID);
const canvas = document.getElementById(CANVAS_ID);
const resultDiv = document.getElementById(RESULT_ID);
const downloadBtn = document.getElementById(DOWNLOAD_ID);
if (inp && canvas && resultDiv && downloadBtn) {
	const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas context missing');

	let last = null, timer = 0;
	inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => gen(inp.value || ''), DEBOUNCE); }, { passive: true });
	downloadBtn.addEventListener('click', () => { const dataURL = canvas.toDataURL('image/png'); const a = document.createElement('a'); a.href = dataURL; a.download = 'qr.png'; a.click(); });

	// initial render
	gen(inp.value || '');

	function gen(text) {
		if (text === last) return; last = text;
		if (!text) { clearCanvas(); resultDiv.style.display = 'none'; downloadBtn.style.display = 'none'; return; }

		const segs = qrcodegen.QrSegment.makeSegments(text);
		const ecls = [qrcodegen.QrCode.Ecc.MEDIUM, qrcodegen.QrCode.Ecc.LOW];
		let qr = null;
		for (const ecl of ecls) { try { qr = qrcodegen.QrCode.encodeSegments(segs, ecl, 1, 40, -1, true); break; } catch (err) { /* try next */ } }
		if (!qr) { paintError('Too long'); return; }

		const device = window.devicePixelRatio || 1;
		const containerWidth = canvas.clientWidth || MIN_CSS;
		let modulePx = Math.floor(containerWidth / (qr.size + BORDER * 2));
		modulePx = Math.max(MIN_MODULE_PX, Math.min(MAX_MODULE_PX, modulePx));
		let cssSize = (qr.size + BORDER * 2) * modulePx;
		if (cssSize < MIN_CSS) {
			modulePx = Math.ceil(MIN_CSS / (qr.size + BORDER * 2));
			modulePx = Math.max(MIN_MODULE_PX, Math.min(MAX_MODULE_PX, modulePx));
			cssSize = (qr.size + BORDER * 2) * modulePx;
		}

		canvas.style.width = cssSize + 'px'; canvas.style.height = cssSize + 'px'; canvas.width = Math.round(cssSize * device); canvas.height = Math.round(cssSize * device);
		ctx.setTransform(device, 0, 0, device, 0, 0);
		ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cssSize, cssSize);
		ctx.fillStyle = '#000000';
		for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) { const px = (x + BORDER) * modulePx; const py = (y + BORDER) * modulePx; ctx.fillRect(Math.round(px), Math.round(py), Math.round(modulePx), Math.round(modulePx)); }
		resultDiv.style.display = 'block'; downloadBtn.style.display = 'inline-block';
	}

	function clearCanvas() { const device = window.devicePixelRatio || 1; const css = canvas.clientWidth || MIN_CSS; canvas.style.width = css + 'px'; canvas.style.height = css + 'px'; canvas.width = Math.round(css * device); canvas.height = Math.round(css * device); ctx.setTransform(device, 0, 0, device, 0, 0); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, css, css); }

	function paintError(msg) { const device = window.devicePixelRatio || 1; const css = canvas.clientWidth || MIN_CSS; canvas.style.width = css + 'px'; canvas.style.height = css + 'px'; canvas.width = Math.round(css * device); canvas.height = Math.round(css * device); ctx.setTransform(device, 0, 0, device, 0, 0); ctx.fillStyle = '#fff7f7'; ctx.fillRect(0, 0, css, css); ctx.fillStyle = '#900'; ctx.font = Math.max(12, Math.floor(css / 16)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(msg, css / 2, css / 2); }
}

document.getElementById('goBackBtn').addEventListener('click', () => { window.location.href = '../index.html'; });
