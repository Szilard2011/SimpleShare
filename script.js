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
        color: "#8b5cf6",
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
             chunkStatus.innerText = "Compressing data...";
             const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
             blobToProcess = await new Response(stream).blob();
         } catch(e) {}
    }

    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exportedKey = await window.crypto.subtle.exportKey("jwk", key);

    const totalChunks = Math.ceil(blobToProcess.size / CHUNK_SIZE);
    const atomIDs = [];
    
    for(let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, blobToProcess.size);
        const chunkBlob = blobToProcess.slice(start, end);
        
        updateProgress(`Uploading part ${i+1}/${totalChunks}...`, (i/totalChunks)*100);
        chunkStatus.innerText = `Encrypting chunk ${i+1}...`;

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const chunkBuffer = await chunkBlob.arrayBuffer();
        const encryptedChunk = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, chunkBuffer);

        let id = null, attempts = 0;
        while(id === null && attempts < 3) {
             attempts++;
             id = await uploadToCatbox(encryptedChunk, iv);
        }
        if(!id) { alert("Network error. Please try again."); location.reload(); return; }
        atomIDs.push(id);
    }

    updateProgress("Finishing...", 90);
    
    const masterMap = { n: file.name, t: file.type, s: file.size, k: exportedKey, c: atomIDs, z: (blobToProcess.size !== file.size) };
    const mapString = JSON.stringify(masterMap);
    
    const password = generateRandomString(6);
    const derivedKey = await deriveKeyFromPassword(password);
    const mapIV = window.crypto.getRandomValues(new Uint8Array(12));
    const mapEncrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: mapIV }, derivedKey, new TextEncoder().encode(mapString));
    
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
    
    const mapID = parts[0];
    const password = parts[1];
    
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
        const iv = mapBuffer.slice(0, 12);
        const data = mapBuffer.slice(12);
        
        const decryptedMapBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, derivedKey, data);
        const mapJson = JSON.parse(new TextDecoder().decode(decryptedMapBuffer));
        const atomKey = await window.crypto.subtle.importKey("jwk", mapJson.k, { name: "AES-GCM" }, true, ["decrypt"]);

        const chunks = new Array(mapJson.c.length);
        const total = mapJson.c.length;
        let completed = 0;

        for (let i = 0; i < total; i += 3) {
            const batch = mapJson.c.slice(i, i + 3);
            await Promise.all(batch.map(async (atomID, idx) => {
                const globalIdx = i + idx;
                updateProgress(`Downloading parts...`, (completed/total)*90);
                chunkStatus.innerText = `Fetching part ${globalIdx + 1} of ${total}`;
                
                const atomRes = await fetch(`https://corsproxy.io/?https://files.catbox.moe/${atomID}`);
                const atomBuffer = await atomRes.arrayBuffer();
                const aIv = atomBuffer.slice(0, 12);
                const aData = atomBuffer.slice(12);
                chunks[globalIdx] = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: aIv }, atomKey, aData);
                completed++;
            }));
        }

        updateProgress("Assembling...", 95);
        let finalBlob = new Blob(chunks);
        
        if(mapJson.z) {
             chunkStatus.innerText = "Expanding data...";
             const ds = new DecompressionStream('gzip');
             const stream = finalBlob.stream().pipeThrough(ds);
             finalBlob = await new Response(stream).blob();
        }

        updateProgress("Done!", 100);
        showDownloadScreen(finalBlob, mapJson.n, mapJson.s);

    } catch (e) {
        console.error(e);
        alert("Could not retrieve file. Code might be wrong.");
        location.reload();
    }
}

async function deriveKeyFromPassword(password) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return window.crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("NeuralShareSalt"), iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function uploadToCatbox(dataBuffer, iv) {
    const blobToSend = new Blob([iv, dataBuffer], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', blobToSend, "data.bin");
    try {
        const response = await fetch('https://corsproxy.io/?https://catbox.moe/user/api.php', { method: 'POST', body: formData });
        const url = await response.text();
        return url.split('/').pop(); 
    } catch(e) { return null; }
}

function showDownloadScreen(blob, name, size) {
    processingView.style.display = 'none';
    downloadView.style.display = 'block';
    document.getElementById('dl-filename').innerText = name;
    document.getElementById('dl-filesize').innerText = formatBytes(size);
    
    const ext = name.split('.').pop().toLowerCase();
    const badge = document.getElementById('scan-container');
    const dangerous = ['exe', 'bat', 'cmd', 'sh', 'vbs'];
    if(dangerous.includes(ext)) {
        badge.className = "security-badge warning";
        document.getElementById('scan-desc').innerText = "Caution: Executable File";
        document.getElementById('scan-icon').innerText = "⚠️";
    } else {
        badge.className = "security-badge";
        document.getElementById('scan-desc').innerText = "File looks safe";
        document.getElementById('scan-icon').innerText = "🛡️";
    }

    document.getElementById('final-download-btn').onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
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
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
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
    constructor() { this.x = Math.random() * width; this.y = Math.random() * height; this.vx = (Math.random()-0.5)*0.2; this.vy = (Math.random()-0.5)*0.2; this.size = Math.random()*3; }
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
