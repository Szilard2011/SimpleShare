const modes = {
    send: { title: "Share Anything", desc: "Upload files securely. Unlimited size.", badge: "SECURE CLOUD", color: "#6366f1", type: "upload" },
    receive: { title: "Get Files", desc: "Enter your secure code.", badge: "RETRIEVE", color: "#a855f7", type: "input" }
};

const root = document.documentElement;
const contentArea = document.getElementById('content-area');
const titleEl = document.getElementById('main-title');
const descEl = document.getElementById('main-desc');
const badgeEl = document.getElementById('mode-badge');
const dockItems = document.querySelectorAll('.dock-item');
const uploadUI = document.getElementById('upload-ui');
const transferUI = document.getElementById('transfer-ui');
const fileInput = document.getElementById('file-input');
const textInput = document.getElementById('text-input');
const processingView = document.getElementById('processing-view');
const resultView = document.getElementById('result-view');
const downloadView = document.getElementById('download-view');
const chunkStatus = document.getElementById('chunk-details');
const progressFill = document.getElementById('progress-fill');
const speedBadge = document.getElementById('speedometer');
const pingDisplay = document.getElementById('ping-display');

let currentMode = 'send';
const CHUNK_SIZE = 190 * 1024 * 1024; 
let wakeLock = null;
let soundContext = new (window.AudioContext || window.webkitAudioContext)();

const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const closeAbout = document.getElementById('close-about');
const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeHistory = document.getElementById('close-history');
const clearHistoryBtn = document.getElementById('clear-history');
const themeBtn = document.getElementById('theme-btn');
const pasteBtn = document.getElementById('paste-btn');
const nativeShareBtn = document.getElementById('native-share-btn');
const zenModeBtn = document.getElementById('zen-mode-btn');

aboutBtn.onclick = () => aboutModal.classList.add('active');
closeAbout.onclick = () => aboutModal.classList.remove('active');
aboutModal.onclick = (e) => { if(e.target === aboutModal) aboutModal.classList.remove('active'); };

historyBtn.onclick = () => { loadHistory(); historyModal.classList.add('active'); };
closeHistory.onclick = () => historyModal.classList.remove('active');
historyModal.onclick = (e) => { if(e.target === historyModal) historyModal.classList.remove('active'); };
clearHistoryBtn.onclick = () => { localStorage.removeItem('simpleshare_history'); loadHistory(); showToast("History cleared"); };

themeBtn.onclick = () => {
    root.classList.toggle('light-mode');
    themeBtn.innerText = root.classList.contains('light-mode') ? "🌙" : "☀";
    showToast("Theme updated");
};

pasteBtn.onclick = async () => {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('receive-code').value = text;
        showToast("Pasted from clipboard");
    } catch(err) { showToast("Clipboard access denied"); }
};

nativeShareBtn.onclick = () => {
    const code = document.getElementById('final-code').innerText;
    const link = document.getElementById('final-link').innerText;
    if (navigator.share) {
        navigator.share({ title: 'SimpleShare File', text: `Here is the file code: ${code}`, url: link });
    } else { showToast("Sharing not supported"); }
};

zenModeBtn.onclick = () => {
    document.querySelector('.container').classList.toggle('zen');
    zenModeBtn.innerText = document.querySelector('.container').classList.contains('zen') ? "Exit Zen" : "Zen Mode";
};

document.getElementById('send-text-btn').onclick = () => {
    const text = textInput.value;
    if(!text) return showToast("Enter text first");
    const blob = new Blob([text], {type: 'text/plain'});
    startSlicingSequence(blob, "Secret_Note.txt", "text/plain");
};

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const magicCode = urlParams.get('code');
    if(magicCode) {
        dockItems[1].click(); 
        document.getElementById('receive-code').value = magicCode;
        setTimeout(() => { startReconstruction(magicCode); }, 500);
    }
    checkPing();
    setInterval(checkPing, 10000);
}

async function checkPing() {
    const start = Date.now();
    try {
        await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
        const latency = Date.now() - start;
        pingDisplay.innerText = latency + "ms";
        pingDisplay.style.color = latency < 200 ? "var(--success)" : "var(--warning)";
    } catch(e) { pingDisplay.innerText = "Offline"; }
}

function switchInputMode(mode) {
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    if(mode === 'file') {
        document.getElementById('file-mode-view').style.display = 'block';
        document.getElementById('text-mode-view').style.display = 'none';
    } else {
        document.getElementById('file-mode-view').style.display = 'none';
        document.getElementById('text-mode-view').style.display = 'flex';
    }
}

updateTheme('send');

dockItems.forEach(item => {
    item.addEventListener('click', () => {
        const mode = item.dataset.mode;
        if(mode === currentMode) return;
        dockItems.forEach(b => b.classList.remove('active'));
        item.classList.add('active');
        currentMode = mode;
        updateTheme(mode);
        resetAllViews();
    });
});

function resetAllViews() {
    processingView.style.display = 'none';
    resultView.style.display = 'none';
    downloadView.style.display = 'none';
    contentArea.style.display = 'flex';
    contentArea.style.opacity = '1';
    fileInput.value = '';
    textInput.value = '';
    document.getElementById('receive-code').value = '';
    document.getElementById('password-prompt').style.display = 'none';
    document.getElementById('decrypt-password').value = '';
    document.querySelector('.container').classList.remove('zen');
}

function updateTheme(modeKey) {
    const data = modes[modeKey];
    contentArea.style.opacity = '0';
    setTimeout(() => {
        titleEl.textContent = data.title;
        descEl.textContent = data.desc;
        badgeEl.textContent = data.badge;
        root.style.setProperty('--primary', data.color);
        
        if(data.type === 'upload') {
            uploadUI.style.display = 'block';
            transferUI.style.display = 'none';
            document.getElementById('input-mode-tabs').style.display = 'flex';
        } else {
            uploadUI.style.display = 'none';
            transferUI.style.display = 'block';
            document.getElementById('input-mode-tabs').style.display = 'none';
        }
        contentArea.style.opacity = '1';
    }, 200);
}

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processUploadInput(e.target.files);
});

async function processUploadInput(files) {
    let finalBlob;
    let fileName;
    let fileType;

    contentArea.style.display = 'none';
    processingView.style.display = 'flex';
    requestWakeLock();
    
    if (files.length > 1) {
        chunkStatus.innerText = "Bundling files into ZIP...";
        updateProgress("Archiving...", 5);
        const zip = new JSZip();
        for (let file of files) {
            zip.file(file.name, file);
        }
        finalBlob = await zip.generateAsync({type:"blob", compression: "STORE"});
        fileName = "Archive_" + Date.now() + ".zip";
        fileType = "application/zip";
    } else {
        finalBlob = files[0];
        fileName = files[0].name;
        fileType = files[0].type;
    }

    startSlicingSequence(finalBlob, fileName, fileType);
}

async function startSlicingSequence(file, name, type) {
    updateProgress("Analyzing...", 10);
    chunkStatus.innerText = "Optimizing stream...";
    playSound('start');

    let startTime = Date.now();
    let loadedBytes = 0;

    let blobToProcess = file;
    if ('CompressionStream' in window && !['zip','mp4','jpg','png'].some(ext => type.includes(ext))) {
         try {
             const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
             blobToProcess = await new Response(stream).blob();
         } catch(e) {}
    }

    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exportedKey = await window.crypto.subtle.exportKey("jwk", key);

    const totalChunks = Math.ceil(blobToProcess.size / CHUNK_SIZE);
    const atomIDs = new Array(totalChunks);
    
    const chunksToProcess = [];
    for (let i = 0; i < totalChunks; i++) chunksToProcess.push(i);
    let completed = 0;
    const PARALLEL_LIMIT = 6;

    const processChunk = async (i) => {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, blobToProcess.size);
        const chunkBlob = blobToProcess.slice(start, end);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const chunkBuffer = await chunkBlob.arrayBuffer();
        const encryptedChunk = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, chunkBuffer);

        let id = null, attempts = 0;
        while(id === null && attempts < 3) {
             attempts++;
             id = await uploadToCatbox(encryptedChunk, iv);
        }
        if(!id) throw new Error(`Upload failed`);
        atomIDs[i] = id;
        completed++;
        loadedBytes += chunkBlob.size;
        updateSpeed(loadedBytes, startTime);
        updateProgress(`Uploading...`, (completed/totalChunks)*90);
    };

    for (let i = 0; i < totalChunks; i += PARALLEL_LIMIT) {
        const batch = chunksToProcess.slice(i, i + PARALLEL_LIMIT);
        chunkStatus.innerText = `Uploading parts ${i+1}-${Math.min(i+batch.length, totalChunks)}/${totalChunks}...`;
        await Promise.all(batch.map(processChunk));
    }

    updateProgress("Finalizing...", 95);
    chunkStatus.innerText = "Securing Map...";

    const masterMap = { n: name, t: type, s: file.size, k: exportedKey, c: atomIDs, z: (blobToProcess.size !== file.size) };
    
    let password = document.getElementById('custom-password').value.trim();
    if(!password) password = generateRandomString(6); 
    
    const derivedKey = await deriveKeyFromPassword(password);
    const mapIV = window.crypto.getRandomValues(new Uint8Array(12));
    const mapEncrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: mapIV }, derivedKey, new TextEncoder().encode(JSON.stringify(masterMap)));
    
    const finalMapID = await uploadToCatbox(mapEncrypted, mapIV);
    
    if(finalMapID) {
        const cleanID = finalMapID.split('.')[0];
        let finalCode = "";
        
        if(document.getElementById('burn-toggle').checked) {
            chunkStatus.innerText = "Setting up Self-Destruct...";
            const burnID = await uploadToBurner(cleanID, password);
            if(burnID) finalCode = "BURN-" + burnID; 
            else finalCode = `${cleanID}-${password}`; 
        } else {
            if (document.getElementById('custom-password').value.trim()) {
                finalCode = `${cleanID}-${password}`;
            } else {
                finalCode = `${cleanID}-${password}`;
            }
        }
        
        saveHistory(name, finalCode);
        updateProgress("Done!", 100);
        fireConfetti();
        playSound('success');
        showResult(finalCode);
    }
}

async function deriveKeyFromPassword(password) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return window.crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("SimpleShareSalt"), iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function uploadToCatbox(dataBuffer, iv) {
    const blob = new Blob([iv, dataBuffer], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', blob, "data.bin");
    try {
        const res = await fetch('https://corsproxy.io/?https://catbox.moe/user/api.php', { method: 'POST', body: formData });
        const url = await res.text();
        return url.split('/').pop(); 
    } catch(e) { return null; }
}

async function uploadToBurner(mapID, password) {
    const payload = JSON.stringify({ id: mapID, pass: password });
    const blob = new Blob([payload], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob);
    try {
        const res = await fetch('https://file.io/?expires=1w', { method: 'POST', body: formData });
        const json = await res.json();
        if(json.success) return json.key;
        return null;
    } catch(e) { return null; }
}

document.getElementById('connect-btn').addEventListener('click', () => {
    let val = document.getElementById('receive-code').value.trim();
    if(val.includes('code=')) val = val.split('code=')[1];
    
    if(val.startsWith("BURN-")) {
        retrieveBurner(val.split("BURN-")[1]);
    } else if (val.includes("-")) {
        startReconstruction(val.split("-")[0], val.split("-")[1]);
    } else {
        showToast("Invalid code format");
    }
});

async function retrieveBurner(key) {
    contentArea.style.display = 'none';
    processingView.style.display = 'flex';
    updateProgress("Fetching Burner Key...", 20);
    try {
        const res2 = await fetch(`https://file.io/${key}`);
        if(!res2.ok) throw new Error();
        const text = await res2.text();
        const data = JSON.parse(text);
        startReconstruction(data.id, data.pass);
    } catch(err) {
        showToast("Link expired or invalid");
        setTimeout(() => location.reload(), 2000);
    }
}

async function startReconstruction(mapID, password) {
    contentArea.style.display = 'none';
    processingView.style.display = 'flex';
    updateProgress("Locating Map...", 10);
    chunkStatus.innerText = "Decrypting...";
    requestWakeLock();
    let startTime = Date.now();
    let loadedBytes = 0;

    try {
        const derivedKey = await deriveKeyFromPassword(password);
        let mapRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${mapID}`);
        if(!mapRes.ok) mapRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${mapID}.bin`);
        if(!mapRes.ok) throw new Error("Map not found.");
        
        const mapBuffer = await mapRes.arrayBuffer();
        const iv = mapBuffer.slice(0, 12), data = mapBuffer.slice(12);
        
        const decryptedMapBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, derivedKey, data);
        const mapJson = JSON.parse(new TextDecoder().decode(decryptedMapBuffer));
        const atomKey = await window.crypto.subtle.importKey("jwk", mapJson.k, { name: "AES-GCM" }, true, ["decrypt"]);

        const chunks = new Array(mapJson.c.length);
        const total = mapJson.c.length;
        let completed = 0;
        
        const MAX_DL = 6;
        let activeDl = 0, nextDl = 0;

        return new Promise((resolve) => {
            const fetchNext = async () => {
                if(nextDl >= total) return;
                const i = nextDl++;
                activeDl++;
                
                updateProgress("Downloading...", (completed/total)*90);
                chunkStatus.innerText = `Fetching part ${i+1}/${total}`;
                
                const atomRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${mapJson.c[i]}`);
                const atomBuffer = await atomRes.arrayBuffer();
                loadedBytes += atomBuffer.byteLength;
                updateSpeed(loadedBytes, startTime);

                const aIv = atomBuffer.slice(0, 12), aData = atomBuffer.slice(12);
                chunks[i] = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: aIv }, atomKey, aData);
                completed++;
                activeDl--;
                if(completed === total) finishDownload(chunks, mapJson);
                else fetchNext();
            };
            for(let i=0; i<MAX_DL && i<total; i++) fetchNext();
        });

    } catch (e) {
        showToast("Decryption failed. Wrong password?");
        setTimeout(() => location.reload(), 2000);
    }
}

async function finishDownload(chunks, mapJson) {
    updateProgress("Assembling...", 95);
    let finalBlob = new Blob(chunks);
    if(mapJson.z) {
         chunkStatus.innerText = "Expanding...";
         const ds = new DecompressionStream('gzip');
         const stream = finalBlob.stream().pipeThrough(ds);
         finalBlob = await new Response(stream).blob();
    }
    updateProgress("Done!", 100);
    playSound('success');
    fireConfetti();
    const safetyResult = heuristicScan(mapJson.n);
    showDownloadScreen(finalBlob, mapJson.n, mapJson.s, safetyResult);
}

function heuristicScan(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const dangerous = ['exe', 'bat', 'cmd', 'sh', 'vbs', 'msi'];
    if(dangerous.includes(ext)) return { safe: false, desc: "Executable file detected." };
    return { safe: true, desc: "No known threats found." };
}

function showDownloadScreen(blob, name, size, safety) {
    processingView.style.display = 'none';
    downloadView.style.display = 'block';
    document.getElementById('dl-filename').innerText = name;
    document.getElementById('dl-filesize').innerText = formatBytes(size);
    document.getElementById('scan-desc').innerText = safety.desc;
    
    const iconContainer = document.getElementById('file-type-icon');
    if(name.endsWith('.zip')) iconContainer.innerText = "📦";
    else if(name.match(/\.(jpg|jpeg|png|gif)$/i)) iconContainer.innerText = "🖼️";
    else if(name.match(/\.(mp4|mov|avi)$/i)) iconContainer.innerText = "🎬";
    else if(name.match(/\.(mp3|wav)$/i)) iconContainer.innerText = "🎵";
    else iconContainer.innerText = "📄";

    if(!safety.safe) document.getElementById('scan-container').classList.add('warning');

    document.getElementById('final-download-btn').onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
}

function updateProgress(text, percent) {
    document.getElementById('status-message').innerText = text;
    progressFill.style.width = percent + '%';
}

function updateSpeed(bytes, startTime) {
    const duration = (Date.now() - startTime) / 1000;
    const mbps = (bytes / 1024 / 1024) / duration;
    speedBadge.innerText = mbps.toFixed(1) + " MB/s";
}

function showResult(code) {
    processingView.style.display = 'none';
    resultView.style.display = 'block';
    document.getElementById('final-code').innerText = code;
    const link = window.location.href.split('?')[0] + "?code=" + code;
    document.getElementById('final-link').innerText = link;
    
    document.getElementById('qrcode-container').innerHTML = "";
    new QRCode(document.getElementById("qrcode-container"), {
        text: link, width: 128, height: 128
    });

    document.getElementById('copy-code-action').onclick = () => { navigator.clipboard.writeText(code); showToast("Code copied!"); };
    document.getElementById('copy-link-action').onclick = () => { navigator.clipboard.writeText(link); showToast("Link copied!"); };
    switchResultMode('code');
}

function switchResultMode(mode) {
    document.getElementById('view-code').style.display = 'none';
    document.getElementById('view-link').style.display = 'none';
    document.getElementById('view-qr').style.display = 'none';
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    
    if(mode === 'code') { document.getElementById('view-code').style.display = 'block'; document.getElementById('btn-show-code').classList.add('active'); }
    if(mode === 'link') { document.getElementById('view-link').style.display = 'block'; document.getElementById('btn-show-link').classList.add('active'); }
    if(mode === 'qr') { document.getElementById('view-qr').style.display = 'block'; document.getElementById('btn-show-qr').classList.add('active'); }
}

function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(() => showToast("Copied!"));
}

function formatBytes(bytes, d = 2) {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(d)) + ' ' + sizes[i];
}

function generateRandomString(length) {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function saveHistory(name, code) {
    let history = JSON.parse(localStorage.getItem('simpleshare_history') || '[]');
    history.unshift({ name, code, date: new Date().toLocaleDateString() });
    if(history.length > 5) history.pop();
    localStorage.setItem('simpleshare_history', JSON.stringify(history));
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('simpleshare_history') || '[]');
    const container = document.getElementById('history-list');
    container.innerHTML = "";
    if(history.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; text-align: center;">No recent uploads.</p>';
        return;
    }
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div><span class="history-name">${item.name}</span><span class="history-date">${item.date}</span></div>
            <span class="history-code">${item.code}</span>
        `;
        div.onclick = () => {
            navigator.clipboard.writeText(item.code);
            showToast("Code copied!");
        };
        container.appendChild(div);
    });
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function playSound(type) {
    const o = soundContext.createOscillator();
    const g = soundContext.createGain();
    o.connect(g);
    g.connect(soundContext.destination);
    if(type === 'start') { o.frequency.value = 400; g.gain.value = 0.1; o.start(); o.stop(soundContext.currentTime + 0.1); }
    if(type === 'success') { o.frequency.value = 800; g.gain.value = 0.1; o.start(); setTimeout(() => { o.frequency.value = 1200; }, 100); o.stop(soundContext.currentTime + 0.3); }
}

async function requestWakeLock() {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}

function fireConfetti() {
    const c = document.getElementById('confetti-canvas');
    const x = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    let p = [];
    for(let i=0;i<100;i++) p.push({x:c.width/2,y:c.height/2,vx:(Math.random()-0.5)*10,vy:(Math.random()-2)*10,c:`hsl(${Math.random()*360},100%,50%)`});
    function d() {
        x.clearRect(0,0,c.width,c.height);
        p.forEach((e,i)=>{e.x+=e.vx;e.y+=e.vy;e.vy+=0.2;x.fillStyle=e.c;x.fillRect(e.x,e.y,5,5);if(e.y>c.height)p.splice(i,1)});
        if(p.length) requestAnimationFrame(d); else x.clearRect(0,0,c.width,c.height);
    }
    d();
}

const canvas = document.getElementById('organic-canvas');
const ctx = canvas.getContext('2d');
let width, height, particles = [];
function resize() { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();
class Particle {
    constructor() { this.x = Math.random() * width; this.y = Math.random() * height; this.vx = (Math.random()-0.5)*0.2; this.vy = (Math.random()-0.5)*0.2; this.size = Math.random()*2; }
    update() { this.x += this.vx; this.y += this.vy; if(this.x<0||this.x>width)this.vx*=-1; if(this.y<0||this.y>height)this.vy*=-1; }
    draw() { ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
}
for(let i=0; i<60; i++) particles.push(new Particle());
function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
}
animate();

