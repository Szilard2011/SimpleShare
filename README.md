#SimpleShare

## The privacy-first, infinite file transfer tool.
**No signups, no servers, no limits. Just math.**

# Why did I build this?

Because I am tired of the state of file sharing that is now.

**WeTransfer:** has a 2GB size limit (unless you pay).
**Google Drive:** makes you log in, and it traces your identity.
**Discord:** Large files are blocked.

I wanted a means of transferring **giant files** to my friends **forever** without having to pay for a server or spying on what they are doing.

So, I created **SimpleShare**. This application runs within your browser.

## How it works (The Magic)
This is not a regular file-hosting service. It is a **distributed encryption engine**.

**Smart Compression:** Your browser reduces the file size you choose before it leaves your computer, thanks to CompressionStream.
**Military Grade Encryption:** Your file is converted into “digital noise” via **AES-256-GCM** encryption. This occurs on *your* device.
**Atomic Slicing:** If your file is really large (say 10GB), we slice it into 200MB "atoms."
**The Ledger:** We upload the encrypted atoms to **Catbox** (permanent file host) via a public CORS proxy.
**The Key:** The website provides a **12-character code** (or a Magic Link). The code has the map to locate your atoms, as well as the password that is used to unlock them.
Because the encryption happens on your device, I cannot see your files. The server cannot see your files. Only someone with the link can see them.

### FEATURES
**♾️ Infinite Storage:** The file is sliced, which means that theoretically, users can upload unlimited-size files.
**???? Zero-Knowledge:** We don't maintain a database on the back end. We don't keep your IP address or your keys.
**⏳ Forever Storage:** The data is stored on permanent public ledgers. It's not going to expire in 7 days.
**???? Heuristic Scanner:** The client scans the file headers when downloading, alerting you to potential malware (exe/scripts).
**Mobile Friendly:** Fully compatible with mobile phones with a contemporary design.

## Tech Stack
No need for frameworks. No npm install. Just optimized web standards.

**HTML5 / CSS3:** Modern Glassmorphism UI.
**Vanilla JavaScript:** Nothing heavy such as React or Vue is used.
**WebCrypto API:** For native, hardware-accelerated encryption.
**Catbox API:** Storage Backend.

## How to Use It

# Option A: Use the Live Site
https://szilard2011.github.io/SimpleShare/

###& Option B: Run it locally
Because this is a client-side application, you are free to run it on your own computer!

Clone this repo.
Open index.html on Chrome, Edge, or Firefox.
That’s it. It just works.

## Important Note
Because this is a decentralized, encrypted system:

**If you lose your code/link, your file disappears forever.** There is no "Forgot Password" button.

**Be responsible.** Refrain from storing illegal files on our service. Although your storage with us is anonymous, we are dependent on third-party services which work tirelessly to keep the internet clean.

## 🤝 Contributing
Feel free to open an issue or a pull request. Let's make the internet free and open again.

---

*Created with ❤️ (and coffee ☕️) by Pálnagy Szilárd*
