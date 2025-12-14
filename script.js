const modes = {
    send: {
        title: "Share Anything",
        desc: "Upload files of any size. We compress, encrypt, and store them permanently for you.",
        badge: "SECURE CLOUD",
        color: "#6366f1",
        type: "upload" 
    },
    receive: {
        title: "Get Files",
        desc: "Enter your secure code or paste the link to retrieve files.",
        badge: "RETRIEVE",
        color: "#a855f7",
        type: "input" 
    }
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
const processingView = document.getElementById('processing-view');
const resultView = document.getElementById('result-view');
const downloadView = document.getElementById('download-view');
const chunkStatus = document.getElementById('chunk-details');
const progressFill = document.getElementById('progress-fill');

let currentMode = 'send';
const CHUNK_SIZE = 190 * 1024 * 1024; 

// --- MODAL LOGIC ---
const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const closeAbout = document.getElementById('close-about');

aboutBtn.onclick = () => aboutModal.classList.add('active');
closeAbout.onclick = () => aboutModal.classList.remove('active');
aboutModal.onclick = (e) => {
    if(e.target === aboutModal) aboutModal.classList.remove('active');
};

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const magicCode = urlParams.get('code');
    if(magicCode) {
        dockItems[1].click(); 
        document.getElementById('receive-code').value = magicCode;
        setTimeout(() => { startReconstruction(magicCode); }, 500);
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
    document.getElementById('receive-code').value = '';
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
        } else {
            uploadUI.style.display = 'none';
            transferUI.style.display = 'block';
        }
        contentArea.style.opacity = '1';
    }, 200);
}

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) startSlicingSequence(e.target.files[0]);
});

async function startSlicingSequence(file) {
    contentArea.style.display = 'none';
    processingView.style.display = 'flex';
    updateProgress("Analyzing file...", 5);

    let blobToProcess = file;
    if ('CompressionStream' in window && !['zip','mp4','jpg','png'].some(ext => file.type.includes(ext))) {
         try {
             chunkStatus.innerText = "Compressing...";
             const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
             blobToProcess = await new Response(stream).blob();
         } catch(e) {}
    }

    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exportedKey = await window.crypto.subtle.exportKey("jwk", key);

    const totalChunks = Math.ceil(blobToProcess.size / CHUNK_SIZE);
    const atomIDs = new Array(totalChunks);
    
    let activeUploads = 0;
    let nextChunkIndex = 0;
    const MAX_CONCURRENCY = 6;
    let completed = 0;

    return new Promise((resolve, reject) => {
        const next = async () => {
            if (nextChunkIndex >= totalChunks) return;
            
            const i = nextChunkIndex++;
            activeUploads++;

            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, blobToProcess.size);
            const chunkBlob = blobToProcess.slice(start, end);
            
            updateProgress(`Uploading...`, (completed/totalChunks)*90);
            chunkStatus.innerText = `Sending part ${i+1}/${totalChunks}`;

            try {
                const iv = window.crypto.getRandomValues(new Uint8Array(12));
                const chunkBuffer = await chunkBlob.arrayBuffer();
                const encryptedChunk = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, chunkBuffer);

                let id = null, attempts = 0;
                while(id === null && attempts < 3) {
                    attempts++;
                    id = await uploadToCatbox(encryptedChunk, iv);
                }
                
                if(!id) throw new Error("Upload Failed");
                
                atomIDs[i] = id;
                completed++;
                activeUploads--;

                if (completed === totalChunks) {
                    finishUpload(file, exportedKey, atomIDs, blobToProcess.size !== file.size);
                } else {
                    next();
                }
            } catch (err) {
                alert("Network Error");
                location.reload();
            }
        };

        for (let i = 0; i < MAX_CONCURRENCY && i < totalChunks; i++) {
            next();
        }
    });
}

async function finishUpload(file, key, ids, compressed) {
    updateProgress("Finalizing...", 95);
    
    const masterMap = { n: file.name, t: file.type, s: file.size, k: key, c: ids, z: compressed };
    const password = generateRandomString(6);
    const derivedKey = await deriveKeyFromPassword(password);
    const mapIV = window.crypto.getRandomValues(new Uint8Array(12));
    const mapEncrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: mapIV }, derivedKey, new TextEncoder().encode(JSON.stringify(masterMap)));
    
    const finalMapID = await uploadToCatbox(mapEncrypted, mapIV);
    
    if(finalMapID) {
        const cleanID = finalMapID.split('.')[0];
        const finalCode = `${cleanID}-${password}`;
        updateProgress("Done!", 100);
        showResult(finalCode);
    }
}

document.getElementById('connect-btn').addEventListener('click', () => {
    let val = document.getElementById('receive-code').value.trim();
    if(val.includes('code=')) val = val.split('code=')[1];
    if(val.length < 10) return alert("Code looks too short.");
    startReconstruction(val);
});

async function startReconstruction(code) {
    const parts = code.split('-');
    if(parts.length !== 2) return alert("Invalid code format.");
    const [mapID, password] = parts;
    
    contentArea.style.display = 'none';
    processingView.style.display = 'flex';
    updateProgress("Finding file...", 10);
    chunkStatus.innerText = "Securing connection...";

    try {
        const derivedKey = await deriveKeyFromPassword(password);
        let mapRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${mapID}`);
        if(!mapRes.ok) mapRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${mapID}.bin`);
        if(!mapRes.ok) throw new Error("File not found.");
        
        const mapBuffer = await mapRes.arrayBuffer();
        const iv = mapBuffer.slice(0, 12), data = mapBuffer.slice(12);
        
        const decryptedMapBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, derivedKey, data);
        const mapJson = JSON.parse(new TextDecoder().decode(decryptedMapBuffer));
        const atomKey = await window.crypto.subtle.importKey("jwk", mapJson.k, { name: "AES-GCM" }, true, ["decrypt"]);

        const chunks = new Array(mapJson.c.length);
        const total = mapJson.c.length;
        let completed = 0;
        
        const MAX_DL = 6;
        let activeDl = 0;
        let nextDl = 0;

        return new Promise((resolve) => {
            const fetchNext = async () => {
                if(nextDl >= total) return;
                const i = nextDl++;
                activeDl++;
                
                const atomID = mapJson.c[i];
                updateProgress("Downloading...", (completed/total)*90);
                chunkStatus.innerText = `Fetching part ${i+1}/${total}`;

                const atomRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${atomID}`);
                const atomBuffer = await atomRes.arrayBuffer();
                const aIv = atomBuffer.slice(0, 12), aData = atomBuffer.slice(12);
                
                chunks[i] = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: aIv }, atomKey, aData);
                
                completed++;
                activeDl--;

                if(completed === total) {
                    finishDownload(chunks, mapJson);
                } else {
                    fetchNext();
                }
            };

            for(let i=0; i<MAX_DL && i<total; i++) fetchNext();
        });

    } catch (e) {
        alert("Download failed.");
        location.reload();
    }
}

async function finishDownload(chunks, mapJson) {
    updateProgress("Assembling...", 95);
    let finalBlob = new Blob(chunks);
    
    if(mapJson.z) {
         chunkStatus.innerText = "Expanding data...";
         const ds = new DecompressionStream('gzip');
         const stream = finalBlob.stream().pipeThrough(ds);
         finalBlob = await new Response(stream).blob();
    }

    updateProgress("Deep Scanning...", 98);
    
    const analysis = await advancedHeuristicScan(finalBlob, mapJson.n);
    
    updateProgress("Done!", 100);
    showDownloadScreen(finalBlob, mapJson.n, mapJson.s, analysis);
}

async function advancedHeuristicScan(blob, filename) {
    const headerBuffer = await blob.slice(0, 32).arrayBuffer();
    const view = new DataView(headerBuffer);
    const hex = [];
    for(let i=0; i<8; i++) hex.push(view.getUint8(i).toString(16).toUpperCase().padStart(2,'0'));
    const magic = hex.join('');
    
    const ext = filename.split('.').pop().toLowerCase();
    
    let risk = 0;
    let detections = [];
    let detectedType = "Unknown Binary";

    if (magic.startsWith('4D5A')) { detectedType = "Windows Executable"; risk += 5; detections.push("Executable Header"); }
    else if (magic.startsWith('7F454C46')) { detectedType = "Linux Executable"; risk += 4; detections.push("ELF Binary"); }
    else if (magic.startsWith('25504446')) { detectedType = "PDF"; risk += 0; }
    else if (magic.startsWith('504B0304')) { detectedType = "ZIP Archive"; risk += 1; } 
    else if (magic.startsWith('89504E47')) { detectedType = "PNG Image"; risk += 0; }
    else if (magic.startsWith('FFD8FF')) { detectedType = "JPG Image"; risk += 0; }
    else if (magic.startsWith('52617221')) { detectedType = "RAR Archive"; risk += 1; }
    else if (magic.startsWith('D0CF11E0')) { detectedType = "Legacy Office"; risk += 2; detections.push("Legacy Macros"); }

    if (detectedType.includes("Executable") && ['jpg', 'png', 'txt', 'pdf', 'mp4'].includes(ext)) {
        risk += 5;
        detections.push("Extension Spoofing");
    }

    if (filename.match(/\.(txt|doc|pdf|jpg)\.(exe|scr|bat|com|js)$/i)) {
        risk += 5;
        detections.push("Double Extension");
    }

    if (['bat', 'cmd', 'ps1', 'vbs', 'sh', 'js'].includes(ext)) {
        risk += 4;
        detectedType = "System Script";
        detections.push("System Script");
    }

    const entropy = await calculateEntropy(blob.slice(0, 1024));
    
    let safetyLevel = "safe";
    let message = "No threats found.";
    
    if (risk >= 4) {
        safetyLevel = "danger";
        message = detections.join(", ");
    } else if (risk >= 1 || entropy > 7.8) {
        safetyLevel = "warning";
        message = "Caution advised.";
        if (entropy > 7.8) message += " High Entropy.";
    }

    return {
        safe: safetyLevel === "safe",
        level: safetyLevel,
        title: safetyLevel === "safe" ? "Verified Safe" : (safetyLevel === "danger" ? "Threat Detected" : "Caution"),
        desc: message,
        type: detectedType,
        entropy: entropy.toFixed(2)
    };
}

async function calculateEntropy(blob) {
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    const frequencies = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) frequencies[data[i]]++;
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
        if (frequencies[i] > 0) {
            const p = frequencies[i] / data.length;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
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

function showDownloadScreen(blob, name, size, safety) {
    processingView.style.display = 'none';
    downloadView.style.display = 'block';
    document.getElementById('dl-filename').innerText = name;
    document.getElementById('dl-filesize').innerText = formatBytes(size);
    
    const card = document.getElementById('scan-container');
    const icon = document.getElementById('scan-icon');
    const title = document.getElementById('scan-title');
    const desc = document.getElementById('scan-desc');
    const metricEnt = document.getElementById('metric-entropy');
    const metricType = document.getElementById('metric-type');
    
    document.getElementById('scan-metrics').style.display = 'flex';
    
    title.innerText = safety.title;
    desc.innerText = safety.desc;
    metricEnt.innerText = safety.entropy;
    metricType.innerText = safety.type;
    
    card.className = "security-card " + safety.level;
    
    if(safety.level === 'safe') icon.innerText = "🛡️";
    else if(safety.level === 'warning') icon.innerText = "⚠️";
    else icon.innerText = "☣️";

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

function showResult(code) {
    processingView.style.display = 'none';
    resultView.style.display = 'block';
    document.getElementById('final-code').innerText = code;
    document.getElementById('final-link').innerText = window.location.href.split('?')[0] + "?code=" + code;
    switchResultMode('code');
}

function switchResultMode(mode) {
    if (mode === 'code') {
        document.getElementById('view-code').style.display = 'block';
        document.getElementById('view-link').style.display = 'none';
        document.getElementById('btn-show-code').classList.add('active');
        document.getElementById('btn-show-link').classList.remove('active');
    } else {
        document.getElementById('view-code').style.display = 'none';
        document.getElementById('view-link').style.display = 'block';
        document.getElementById('btn-show-code').classList.remove('active');
        document.getElementById('btn-show-link').classList.add('active');
    }
}

function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"));
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
