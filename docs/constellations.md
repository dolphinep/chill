# ⭐ Constellations & Illustration Warping — Libraries & Method

เอกสารนี้อธิบาย **library/ข้อมูลที่ใช้** และ **วิธีการทางเทคนิค** เบื้องหลังฟีเจอร์กลุ่มดาวจริง
(real constellations) และภาพประกอบเทพปกรณัม (mythological illustrations) ใน scenery
"Observatory Peak" — ทั้งหมดอยู่ใน `apps/web/src/engine/sky/ConstellationField.ts` เป็นไฟล์หลัก

ทุกอย่างในฟีเจอร์นี้เป็น**ของจริง** ไม่ใช่ข้อมูลสุ่ม/generative: ตำแหน่งดาวมาจาก Hipparcos star
catalog จริง, เส้นเชื่อมกลุ่มดาวเป็นรูปทรงที่ IAU (International Astronomical Union) รับรองจริง,
และภาพประกอบเป็นงานศิลปะที่มีคนวาดไว้จริงสำหรับโปรแกรม planetarium

---

## 📦 1. Library & แหล่งข้อมูล (What & Why)

| ส่วนประกอบ                  | มาจาก                                                                                           | License                | ใช้ทำอะไร                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| **ตำแหน่งดาว** (5,044 ดวง)  | [`d3-celestial`](https://github.com/ofrohn/d3-celestial) (`stars.6.json`)                       | BSD-2-Clause           | RA/Dec/magnitude ของดาวถึงความสว่าง mag ≤ 6                                             |
| **เส้นเชื่อมกลุ่มดาว** (88) | `d3-celestial` (`constellations.lines.json` + `constellations.json`)                            | BSD-2-Clause           | รูปทรง stick-figure จริงของแต่ละกลุ่มดาว + ชื่อภาษาอังกฤษ                               |
| **ภาพประกอบเทพปกรณัม** (85) | [`stellarium-skycultures`](https://github.com/Stellarium/stellarium-skycultures) (western)      | Free Art License       | ภาพวาดโดย Johan Meuris + จุด calibration (anchor points)                                |
| **คำนวณตำแหน่งจริงบนฟ้า**   | [`astronomy-engine`](https://github.com/cosinekitty/astronomy) (npm, `astronomy-engine@2.1.19`) | MIT, zero dependencies | แปลงพิกัด equatorial (RA/Dec) → horizontal (alt/az) ตามวันที่/เวลา/ตำแหน่งผู้สังเกตจริง |

### ทำไมไม่สร้างข้อมูลเอง (generative)

โจทย์ของฟีเจอร์นี้คือ "รูปร่างกลุ่มดาวต้องเป็นของจริง" — สุ่มตำแหน่งดาวเองจะผิดหลักการตั้งแต่ต้น
ทั้งสามแหล่งข้อมูลข้างต้นถูกเลือกเพราะ:

1. **มีอยู่แล้วจริง ไม่ต้องสร้างใหม่** — `d3-celestial` ถูกสร้างมาเพื่อ web visualization
   โดยเฉพาะ ข้อมูลอยู่ในรูป GeoJSON ที่แปลงหน่วยง่าย ไม่ต้องแปลง catalog format ที่ซับซ้อน
2. **License เปิดพอให้ vendor เข้ามาในโปรเจกต์ได้** — BSD/MIT/Free Art License ทั้งหมด
   อนุญาตให้ใช้ซ้ำได้ (มีเงื่อนไข credit ที่ปฏิบัติตามแล้ว — ดูหัวข้อ 5)
3. **`astronomy-engine` แม่นยำและเบา** — zero dependencies, สูตรคำนวณดาราศาสตร์จริง
   (ไม่ใช่ประมาณ) สำหรับการแปลงพิกัดที่ผิดพลาดง่ายถ้าเขียนสูตร sidereal time เอง

---

## 🔭 2. Pipeline การแปลงข้อมูล (Build-time)

ข้อมูลดิบทั้งหมดถูก**แปลงครั้งเดียว**ตอนพัฒนา (ไม่ใช่ runtime fetch) แล้วเก็บเป็นไฟล์ static:

```
apps/web/src/engine/sky/data/
  stars.json               ← [raHours, decDeg, mag][]  (5,044 ดวง)
  constellations.json      ← { id, name, segments: [ra1,dec1,ra2,dec2][] }[]  (88 กลุ่ม)
  constellationImages.json ← { id, file, size, anchors: {px,py,ra,dec}[3] }[]  (85 กลุ่ม)

apps/web/public/constellations/
  *.webp (85 ไฟล์ภาพประกอบ)  +  CREDITS.txt
```

ขั้นตอนแปลง (Node script, รันครั้งเดียว ไม่ได้อยู่ใน build pipeline):

1. `d3-celestial` เก็บพิกัดเป็น **GeoJSON longitude** (RA แปลงจาก 0–24h เป็น −180°..180°)
   ต้องแปลงกลับ: `raHours = (lon < 0 ? lon + 360 : lon) / 15`
2. **รวม constellation ที่ซ้ำ id** — `Serpens` ถูกวาดเป็น 2 ท่อนแยกกัน (Caput/Cauda) แต่ใช้ id
   `Ser` เดียวกันในข้อมูลต้นฉบับ ถ้าไม่รวมก่อนจะได้ 89 รายการ (ซ้ำ) แทนที่จะเป็น 88 จริง — บั๊กนี้
   เจอจริงตอน dev (React "duplicate key" error) และ fix โดยรวม segments ของทั้งสอง id เข้าด้วยกัน
3. **จับคู่ HIP number → RA/Dec** — ภาพประกอบจาก Stellarium อ้างอิงดาวด้วย Hipparcos catalog
   number (`hip`) ไม่ใช่ RA/Dec ตรงๆ ต้อง join กับ `stars.6.json`'s `id` field (ยืนยันแล้วว่า
   `id` คือ HIP number จริง โดยเทียบกับดาวที่รู้ค่าแน่นอน เช่น Vega = HIP 91262)

---

## 🌌 3. การจัดวางตำแหน่งจริงบนท้องฟ้า (Runtime)

### Equatorial → Horizontal transform

ดาวแต่ละดวงมี RA/Dec คงที่ (ไม่ขึ้นกับผู้สังเกต) แต่ตำแหน่งที่ "มองเห็น" บนท้องฟ้า (มุมเงย/ทิศ —
altitude/azimuth) ขึ้นกับ **วันที่ เวลา และตำแหน่งผู้สังเกตบนโลก** — นี่คือสิ่งที่ทำให้ date picker
ใช้งานได้จริง ไม่ใช่แค่หมุนท้องฟ้าแบบสุ่ม:

```ts
const observer = new Astronomy.Observer(13.75, 100.5, 0) // กรุงเทพฯ
const hor = Astronomy.Horizon(date, observer, raHours, decDeg, 'normal')
// hor.altitude, hor.azimuth — มุมจริง ณ วันที่/เวลานั้น
```

ตำแหน่งอ้างอิงคือกรุงเทพฯ (13.75°N, 100.5°E) และประเมินที่เวลา 20:00 คงที่เสมอ (date picker เลือกได้
แค่วัน ไม่ใช่เวลา) — ทำให้ผลลัพธ์คาดเดาได้และเทียบกับท้องฟ้าจริงได้ตรงไปตรงมา

ตรวจสอบความถูกต้องแล้วจริงด้วยดาราศาสตร์จริง ไม่ใช่แค่ไม่ error: Scorpius ขึ้นจริงตอนหัวค่ำเดือน
สิงหาคม, Orion ไม่ขึ้น (แต่ขึ้นตอนมกราคม) — ตรงกับพฤติกรรมท้องฟ้าจริงทุกประการ

### แปลง alt/az → ทิศทาง 3D

```ts
function altAzToDirection(altitudeDeg, azimuthDeg, out) {
  const alt = degToRad(altitudeDeg),
    az = degToRad(azimuthDeg)
  const horizontal = Math.cos(alt)
  out.set(horizontal * Math.sin(az), Math.sin(alt), -horizontal * Math.cos(az))
}
```

convention ของฉาก (arbitrary เพราะ terrain ไม่ได้อิงพิกัดโลกจริง): `-Z` = ทิศเหนือ, `+X` = ทิศ
ตะวันออก, `+Y` = ขึ้นฟ้า — ได้ unit vector คูณด้วย radius ของ sky dome เป็นตำแหน่ง 3D จริง

ดาว/เส้นที่มุมเงยต่ำกว่า 0° (อยู่ใต้ขอบฟ้า) จะถูก "จอด" ที่ตำแหน่ง `(0, -1e6, 0)` แทนที่จะวาดที่
ตำแหน่งจริง (ซึ่งจะทะลุพื้นดิน) — ง่ายกว่าการทำ per-vertex visibility flag ที่ `THREE.Points`/
`LineSegments` ไม่รองรับโดยตรง

---

## 🎨 4. การ Warp ภาพประกอบให้ตรงกับดาวจริง (ส่วนที่ซับซ้อนที่สุด)

นี่คือ**วิธีการหลัก**ที่ทำให้ภาพวาดเทพปกรณัมไปแปะทับดาวจริงได้ถูกต้อง โดยไม่ต้องมีใครมานั่งวาด/
calibrate เอง — Stellarium เตรียมจุด anchor ไว้ให้แล้ว 3 จุดต่อภาพ (pixel position ↔ HIP number)

### ทำไม 3 จุดถึงพอ

3 คู่พิกัด (pixel ↔ 3D) กำหนด **affine transform** ได้ไม่ซ้ำกัน (unique) — นี่คือหลักเรขาคณิต
พื้นฐาน: จุด 3 จุดที่ไม่อยู่ในเส้นตรงเดียวกันกำหนดระนาบได้หนึ่งระนาบเท่านั้น

```
ให้ pixel anchors P0, P1, P2  และ 3D anchors (บนท้องฟ้าจริง) Q0, Q1, Q2
สำหรับ pixel ใดๆ P:
  แก้สมการ P = P0 + s·(P1-P0) + t·(P2-P0)   หา s, t (2 unknowns, 2 equations)
  แล้ว     Q = Q0 + s·(Q1-Q0) + t·(Q2-Q0)   คือตำแหน่ง 3D ของ pixel นั้น
```

`s, t` คำนวณจาก determinant ของระบบสมการเชิงเส้น 2×2 — ทำครั้งเดียวต่อภาพต่อการเปลี่ยนวันที่
(ไม่ใช่ต่อ vertex) แล้ว reuse สำหรับทุก vertex ในภาพนั้น

### ทำไมใช้ grid ไม่ใช่ quad เดียว

Affine transform ข้างต้นแม่นยำที่ 3 จุด anchor แต่จุดอื่นในภาพจะอยู่บน **ระนาบเรียบ** ที่ผ่าน 3 จุด
นั้น ซึ่งเป็นระนาบ ไม่ใช่ทรงกลม — สำหรับกลุ่มดาวที่กินมุมกว้างบนท้องฟ้า มุมของภาพจะ "ลอย" ออกจาก
sky dome อย่างเห็นได้ชัด

แก้โดยแบ่งภาพเป็น grid 7×7 vertex (`IMAGE_GRID = 6` → 49 จุด) แล้ว **re-project** ทุกจุดกลับไปที่
ผิวทรงกลมจริง (`radius / length(point)` แล้วคูณกลับ) — ยืนยันด้วยการทดสอบจริงแล้วว่าทุก vertex
อยู่ห่างจากจุดศูนย์กลางเท่ากับ radius เป๊ะ ไม่ใช่ประมาณ

### Layering & Performance

- **เส้นกลุ่มดาวทั้ง 88** รวมเป็น `THREE.LineSegments` เดียว (merged geometry) — 1 draw call
  สำหรับทั้งท้องฟ้า, วาดจางๆ ตลอดเวลา (ไม่ใช่โผล่มาตอน search เท่านั้น)
- **ภาพประกอบ 85 ภาพ** เป็นคนละ mesh — แต่ `frustumCulled = true` (ค่า default) ทำให้ three.js
  ตัดการวาดภาพที่อยู่นอกจออัตโนมัติ เหลือวาดจริงแค่ไม่กี่ภาพที่อยู่ในมุมมองขณะนั้น (ทดสอบจริง:
  กล้องมุมกว้างเห็นพร้อมกัน ~13 กลุ่มดาว จาก 88 กลุ่มทั้งหมด)
- ทั้งเส้นและภาพมี "ความเข้ม" ที่ปรับได้ (`setOpacity`) และปิดได้ทั้งชั้น (`setEnabled`) — ดูปุ่ม
  ปรับในหน้าต่าง Constellations

---

## 🗂️ 5. แผนที่ไฟล์ & Credit

| ไฟล์                                               | หน้าที่                                                   |
| -------------------------------------------------- | --------------------------------------------------------- |
| `engine/sky/ConstellationField.ts`                 | ทุกอย่าง: ดาว, เส้น, ภาพ, date-based positioning, opacity |
| `engine/sky/data/*.json`                           | ข้อมูลที่แปลงแล้ว (ดูหัวข้อ 2)                            |
| `public/constellations/*.webp` + `CREDITS.txt`     | ภาพประกอบจริง + คำอ้างอิงลิขสิทธิ์                        |
| `components/hud/ConstellationModal.tsx`            | UI ค้นหา, เลือกวันที่, ปรับความเข้ม/เปิดปิด               |
| `components/world/ConstellationHighlightLayer.tsx` | ป้ายชื่อ (HTML overlay, ไม่ใช่ 3D text)                   |

**Credit ที่ต้องรักษาไว้** (Free Art License กำหนด): ภาพประกอบโดย Johan Meuris ผ่านโปรเจกต์
Stellarium — แสดงอยู่ที่ท้ายหน้าต่าง Constellations ในแอป และใน `CREDITS.txt`
