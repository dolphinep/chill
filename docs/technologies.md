# 💻 Technology Stack & Technical Rationale

เอกสารนี้อธิบายถึง **เทคโนโลยีหลักที่เลือกใช้ในโปรเจกต์ Chill**, **เหตุผลทางสถาปัตยกรรม (Why We Chose It)** และ **การนำไปประยุกต์ใช้งานจริงในระบบ (What It Enables)**

---

## 📊 สรุปภาพรวมของเทคโนโลยี (Tech Stack Matrix)

| หมวดหมู่ (Category)       | เทคโนโลยีที่เลือกใช้ (Technology)              | หน้าที่หลักในระบบ (Core Responsibility)          | จุดเด่นสำคัญ (Key Benefit)                                     |
| :------------------------ | :--------------------------------------------- | :----------------------------------------------- | :------------------------------------------------------------- |
| **3D Graphics & Shaders** | **Three.js WebGPU + TSL**                      | การแสดงผลโลก 3D, Shaders และฟิสิกส์ภูมิประเทศ    | Next-Gen GPU Pipeline, Compute Shaders, Low Overhead           |
| **Web Framework & UI**    | **Next.js 16 (Turbopack + React 19)**          | โครงสร้างเว็บ, Glassmorphism HUD, Modal Overlays | Instant HMR, Code-Splitting, Modern React Hook APIs            |
| **Audio Engine**          | **Web Audio API (Procedural Synthesizers)**    | สังเคราะห์ดนตรี Lo-fi และเสียงธรรมชาติสด 100%    | 0 Bandwidth, ไม่มีลูปเสียงซ้ำ, ควบคุม Gain & Filter Real-time  |
| **Programming Language**  | **Pure TypeScript (Framework-Agnostic)**       | ลอจิกฟิสิกส์, Kinematics, กฎกติกาเกมกีฬา         | Type Safety สูงสุด, แยก Engine ออกจาก React Cycle อย่างเด็ดขาด |
| **Networking & Protocol** | **WebSocket Relay (`ws` + Monorepo Protocol)** | ระบบ Multi-room LAN/Online Multiplayer           | Real-time Bidirectional Wire, Low Latency, Anti-Ghost          |

---

## 🎨 1. Three.js WebGPU & TSL (Three.js Shading Language)

### ❓ ทำไมถึงเลือกใช้ (Why We Chose It)

1. **ก้าวข้ามข้อจำกัดของ WebGL**: WebGPU เป็นมาตรฐานกราฟิกใหม่ล่าสุดบนเว็บเบราว์เซอร์ ช่วยลด CPU Driver Overhead และส่งคำสั่งวาด (Draw Calls) ไปยัง GPU ได้เร็วกว่า WebGL อย่างมหาศาล
2. **TSL (Node-based Shading System)**: การเขียน Shader ด้วย TSL (Three.js Shading Language) มีความยืดหยุ่นสูง สามารถคอมไพล์แปลงเป็น WGSL (WebGPU) หรือ GLSL (WebGL2 Fallback) ได้อัตโนมัติ ทำให้กราฟิกรันได้ทุกเบราว์เซอร์
3. **รองรับ Compute Shaders & Dynamic Render Targets**: เหมาะกับการคำนวณกราฟิกระดับสูงบน GPU โดยตรง เช่น การยุบตัวของผืนทรายและหิมะ

### 🛠️ นำมาทำอะไรในโปรเจกต์ (What It Enables in Chill)

- **Atmospheric Sky & Sunlight**: คำนวณ Rayleigh & Mie Atmospheric Scattering จำลองสีของท้องฟ้า ทะเลหมอก และทิศทางแดดตามเวลาของวัน (Time of Day Transitions)
- **Dynamic Terrain Deformation (ระบบรอยเท้าบนทราย/หิมะ)**: ใช้ GPU Ping-Pong Depth Render Target ในการ Stamp รอยเท้าของผู้เล่นและลูกบอลลงบนพื้นผิวทรายและหิมะแบบ Real-time
- **Clipmap Infinite Terrain**: การสร้าง Grid วงแหวนซ้อนแบบ Concentric Clipmap ช่วยให้มองเห็นภูมิประเทศได้ไกลสุดลูกหูลูกตาโดยที่กิน Polygons น้อยมาก
- **Post-Processing & Lighting**: ทำงานร่วมกับ ToneMapping, HDR Exposure, Dynamic Cascade Shadow Maps (CSM), และ Particles แสงไฟ

---

## ⚡ 2. Next.js 16 (App Router & Turbopack)

### ❓ ทำไมถึงเลือกใช้ (Why We Chose It)

1. **Turbopack ความเร็วสูง**: มอบความเร็วในการ Compile และ Fast Refresh ในระดับมิลลิวินาที ทำให้การพัฒนา 3D Scene และ UI ควบคู่กันลื่นไหลอย่างยิ่ง
2. **Clean Separation of Concerns**: สถาปัตยกรรม App Router ช่วยแยกการโหลด Shell หน้าเว็บออกจากโมดูลกราฟิกหนักๆ ด้วย Dynamic Imports (`next/dynamic` with `ssr: false`)
3. **Modern React 19 Integration**: รองรับการผูก State แบบไร้รอยต่อด้วย `useSyncExternalStore` เพื่อเชื่อมต่อ UI HUD เข้ากับ Event Bus ของ 3D Engine โดยไม่ทำให้เกิด Re-render ที่ไม่จำเป็น

### 🛠️ นำมาทำอะไรในโปรเจกต์ (What It Enables in Chill)

- **High-Performance HUD & Modals**: แผงควบคุม Glassmorphism Dock, เมนูเลือกของตกแต่ง (Prop Palette), ตัวเลือกปรับแต่งโมเดลจิบิ (Avatar Customizer) และตัวเลือกแผนที่ (Scenery Picker)
- **Network API Integration**: มี Built-in Route Handler (`/api/lan/info`) ตรวจหาหมายเลข IP LAN ภายในเครื่อง สำหรับให้ผู้ใช้ Copy ลิงก์ห้องชวนเพื่อนบนเครือข่าย WiFi เดียวกันได้ในคลิกเดียว
- **Asset Optimization**: โหลดฟอนต์และ Asset ภาพแบบ Optimized ลดอาการกระตุกขณะเข้าสู่หน้าจอ 3D

---

## 🎹 3. Web Audio API (Procedural & Generative Synthesis)

### ❓ ทำไมถึงเลือกใช้ (Why We Chose It)

1. **0 Network Bandwidth & Zero Load Time**: ไม่ต้องดาวน์โหลดไฟล์ MP3/WAV ขนาดใหญ่ ทำให้เปิดเว็บแล้วเล่นได้ทันที
2. **Endless Non-Repetitive Music**: ดนตรีที่สังเคราะห์ด้วย Code จะไม่มีวันเล่นวนลูปซ้ำแบบเดิมเหมือนไฟล์เสียงอัดทั่วไป
3. **Interactive Audio Reactivity**: สามารถปรับความถี่ Filter, Resonance, Delay, และ Gain ตามสถานะของเกมได้ทันที (เช่น เมื่อดำน้ำ หรือเดินเข้าใกล้กองไฟ)

### 🛠️ นำมาทำอะไรในโปรเจกต์ (What It Enables in Chill)

- **Generative Lo-fi Synth (`generative.ts`)**: สร้างโหนด Oscillator, BiquadFilter, และ Stereo Feedback Delay เพื่อสังเคราะห์คอร์ดเปียโน กีตาร์โปร่ง และเบสอุ่นๆ ตาม Mood ที่เลือก
- **Procedural Nature Ambience**: สังเคราะห์คลื่นทะเลซัดสาด, เสียงลมพัดผ่านยอดหญ้า, และเสียงนกร้องตามบรรยากาศของแต่ละแมพ
- **Interactive Sound Synthesizers**:
  - เสียงฝีเท้า (Footsteps) ตามชนิดของพื้นผิว (หิมะ, ทราย, หญ้า, ลานกีฬา)
  - เสียงขว้างลูกบอลและเสียงปะทะ
  - เสียงระเบิดดอกไม้ไฟ (Firework Whistle & Burst)
  - เสียงตบวอลเลย์บอลและเสียงนกหวีดกรรมการ
  - เสียงดีดเป้าบินและเสียงเป้าเซรามิกแตกกระจาย (Clay Shatter)

---

## 🔭 4. Astronomy Engine & Celestial Data (`astronomy-engine` & `d3-celestial`)

### ❓ ทำไมถึงเลือกใช้ (Why We Chose It)

1. **Real Physical Astronomy vs Random Stars**: ตำแหน่งดาวฤกษ์และข้างขึ้นข้างแรมของดวงจันทร์ตรงกับท้องฟ้าจริงในโลกแบบเรียลไทม์
2. **Zero-Dependency Lightweight Math**: `astronomy-engine` เป็นโมดูลคณิตศาสตร์ดาราศาสตร์ขนาดเล็กที่มีความแม่นยำสูง และไม่มี external dependency
3. **Open Historical Cultural Assets**: ข้อมูลกลุ่มดาว IAU 88 กลุ่มและภาพวาดเทพปกรณัมคลาสสิก 85 ภาพจาก Stellarium Planetarium

### 🛠️ นำมาทำอะไรในโปรเจกต์ (What It Enables in Chill)

- **Real-time Moon Phase**: คำนวณเฟสข้างขึ้นข้างแรมของดวงจันทร์และแรเงาเส้นขอบมืด-สว่าง (Terminator Curve)
- **IAU Constellations & Star Field**: เรนเดอร์ดาวฤกษ์ 5,044 ดวงและเส้นเชื่อมโยงกลุ่มดาว 88 กลุ่ม
- **Mythological Illustration Warping**: ดึงภาพวาดเทพปกรณัมมาวาร์ปเข้ากับพิกัดดาวจริงบนทรงกลมท้องฟ้าด้วย Barycentric Interpolation

---

## 🤖 5. 100% In-Browser AI (Chrome Prompt API & In-Browser Creative Engine)

### ❓ ทำไมถึงเลือกใช้ (Why We Chose It)

1. **Zero Server Cost & Zero Latency**: ประมวลผลบนเครื่องของผู้ใช้โดยตรง ไม่ต้องเช่า GPU Server ราคาแพง และไม่มี Network Latency
2. **100% Privacy-Preserving**: ข้อความคำคมหรือการคุยกับสัตว์เลี้ยงไม่ถูกส่งออกนอกเครื่อง
3. **Offline Resilience**: ทำงานได้ตลอดเวลา แม้ไม่มีอินเทอร์เน็ตหรือไม่ได้เปิด AI Server

### 🛠️ นำมาทำอะไรในโปรเจกต์ (What It Enables in Chill)

- **Daily Inspiration Billboard**: สุ่มและแต่งคำคมฮีลใจสำหรับคนทำงานและวัยรุ่น 4 หมวดหมู่
- **AI Signpost Poet**: แต่งกลอนไฮกุและคำคมภาษาไทยสั้นๆ ตามบรรยากาศของแต่ละแผนที่
- **Cozy Companion Dialogue**: ตอบรับคำทักทายและให้กำลังใจเมื่อผู้เล่นลูบหัวหรือคุยกับสัตว์เลี้ยง

---

## ☁️ 6. Cloud Run Unified Container & Single-Port Server (`unified-server.ts`)

### ❓ ทำไมถึงเลือกใช้ (Why We Chose It)

1. **Cost-Efficient Serverless Hosting**: รองรับการ Scale-to-zero เมื่อไม่มีผู้ใช้งาน ทำให้ประหยัดค่าใช้จ่าย
2. **Single-Port Architecture (:8080)**: รวม Next.js Web App และ WebSocket Relay เข้าด้วยกันบนพอร์ตเดียว ผ่าน HTTP Upgrade
3. **No CORS / Mixed Content Issues**: ไคลเอนต์เชื่อมต่อทั้งหน้าเว็บและ WebSocket ผ่านโดเมนเดียวกันอย่างไร้รอยต่อ

### 🛠️ นำมาทำอะไรในโปรเจกต์ (What It Enables in Chill)

- **One-Click Deploy (`scripts/deploy-gcp.sh`)**: Build และ Deploy เป็น Google Cloud Run Service เดียวเสร็จสิ้นในคำสั่งเดียว
- **Full Multiplayer Sync**: ซิงค์ตำแหน่งผู้เล่น, แชท, ฉาก, ของตกแต่ง, และกระดานคำคมแบบ Real-time ข้ามผู้ใช้ทุกคนในห้อง
