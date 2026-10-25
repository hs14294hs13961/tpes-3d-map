// 產生網站用的校徽、太平T 胸前圖案、校門與衛生室貼圖。
// 用法（在專案資料夾）：swift tools/textures/make-textures.swift
// 會讀 素材/第三輪修改素材/ 的原始檔，輸出到 app/public/。字型用 macOS 內建的楷體。
import AppKit

let root = FileManager.default.currentDirectoryPath
let src = root + "/素材/第三輪修改素材/"
let out = root + "/app/public/"

func load(_ path: String) -> CGImage {
  let img = NSImage(contentsOfFile: path)!
  var r = CGRect(origin: .zero, size: img.size)
  return img.cgImage(forProposedRect: &r, context: nil, hints: nil)!
}

func canvas(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> CGImage {
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .high
  // 改成左上角為原點，方便照「由上往下」的直覺畫
  ctx.translateBy(x: 0, y: CGFloat(h))
  ctx.scaleBy(x: 1, y: -1)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
  draw(ctx)
  NSGraphicsContext.restoreGraphicsState()
  return ctx.makeImage()!
}

func save(_ img: CGImage, _ name: String, jpeg: Bool = false) {
  let rep = NSBitmapImageRep(cgImage: img)
  let data = jpeg ? rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82])!
                  : rep.representation(using: .png, properties: [:])!
  try! data.write(to: URL(fileURLWithPath: out + name))
  print("寫入", name, img.width, "x", img.height, data.count / 1024, "KB")
}

// 不透明像素的範圍（只看 maxY 以上，排除校徽下方的校名文字）
func opaqueBounds(_ img: CGImage, maxY: Int) -> CGRect {
  let w = img.width, h = img.height
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  let p = ctx.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)
  var x0 = w, y0 = h, x1 = 0, y1 = 0
  for y in stride(from: 0, to: min(h, maxY), by: 4) {
    for x in stride(from: 0, to: w, by: 4) where p[(y * w + x) * 4 + 3] > 20 {
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    }
  }
  return CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
}

func drawImage(_ img: CGImage, _ ctx: CGContext, _ r: CGRect) {
  // 畫面座標已翻轉，圖片要再翻回來
  ctx.saveGState()
  ctx.translateBy(x: r.minX, y: r.maxY)
  ctx.scaleBy(x: 1, y: -1)
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: r.width, height: r.height))
  ctx.restoreGState()
}

func text(_ s: String, _ font: NSFont, _ color: NSColor, at p: CGPoint, center: Bool = true) {
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
  let size = (s as NSString).size(withAttributes: attrs)
  (s as NSString).draw(at: CGPoint(x: center ? p.x - size.width / 2 : p.x, y: p.y), withAttributes: attrs)
}

let kai = { (size: CGFloat) in NSFont(name: "Kaiti TC Bold", size: size) ?? NSFont(name: "Kaiti TC", size: size)! }
let serif = { (size: CGFloat) in NSFont(name: "Times New Roman", size: size)! }

// ---------- 1. 校徽（去掉下方校名） ----------
let emblemSrc = load(src + "1.太平國小_校徽.png")
let eb = opaqueBounds(emblemSrc, maxY: emblemSrc.height * 70 / 100)
let emblem = emblemSrc.cropping(to: eb.insetBy(dx: -40, dy: -40))!
func emblemCanvas(_ size: Int, pad: CGFloat) -> CGImage {
  canvas(size, size) { ctx in
    let s = CGFloat(size) - pad * 2
    let k = min(s / CGFloat(emblem.width), s / CGFloat(emblem.height))
    let w = CGFloat(emblem.width) * k, h = CGFloat(emblem.height) * k
    drawImage(emblem, ctx, CGRect(x: (CGFloat(size) - w) / 2, y: (CGFloat(size) - h) / 2, width: w, height: h))
  }
}
save(emblemCanvas(256, pad: 6), "logo.png")
save(emblemCanvas(64, pad: 1), "favicon-64.png")
save(emblemCanvas(180, pad: 14), "apple-touch-icon.png")

// ---------- 2. 太平T 胸前圖案（設計稿正面，衣服底色去掉變透明） ----------
let tee = load(src + "2.太平Ｔ設計.jpg")
let teeLogo = tee.cropping(to: CGRect(x: 440, y: 425, width: 560, height: 188))!
let teeOut = canvas(256, 86) { ctx in drawImage(teeLogo, ctx, CGRect(x: 0, y: 0, width: 256, height: 86)) }
func keyOut(_ img: CGImage, r: Int, g: Int, b: Int, tol: Int) -> CGImage {
  let w = img.width, h = img.height
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  let p = ctx.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)
  for i in 0..<(w * h) {
    let d = abs(Int(p[i * 4]) - r) + abs(Int(p[i * 4 + 1]) - g) + abs(Int(p[i * 4 + 2]) - b)
    if d < tol { p[i * 4] = 0; p[i * 4 + 1] = 0; p[i * 4 + 2] = 0; p[i * 4 + 3] = 0 }
  }
  return ctx.makeImage()!
}
save(keyOut(teeOut, r: 0xb8, g: 0xe0, b: 0xd3, tol: 40), "textures/tee-logo.png")

// ---------- 3. 校門：磚紅色方塊磁磚 ----------
let tileColor = NSColor(calibratedRed: 0.80, green: 0.52, blue: 0.43, alpha: 1)
let grout = NSColor(calibratedRed: 0.90, green: 0.78, blue: 0.72, alpha: 1)
// 每公尺 160 像素、每片磁磚 0.2 m
func tiles(_ ctx: CGContext, _ w: CGFloat, _ h: CGFloat, ppm: CGFloat = 160) {
  tileColor.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  var seed: UInt64 = 7
  func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat(seed >> 33) / CGFloat(1 << 31) }
  let t = 0.2 * ppm
  var y: CGFloat = 0
  while y < h {
    var x: CGFloat = 0
    while x < w {
      let v = 0.94 + rnd() * 0.1
      NSColor(calibratedRed: 0.80 * v, green: 0.52 * v, blue: 0.43 * v, alpha: 1).setFill()
      ctx.fill(CGRect(x: x + 1.5, y: y + 1.5, width: t - 3, height: t - 3))
      x += t
    }
    y += t
  }
  grout.setStroke()
  ctx.setLineWidth(2.5)
  for gx in stride(from: CGFloat(0), through: w, by: t) { ctx.move(to: CGPoint(x: gx, y: 0)); ctx.addLine(to: CGPoint(x: gx, y: h)) }
  for gy in stride(from: CGFloat(0), through: h, by: t) { ctx.move(to: CGPoint(x: 0, y: gy)); ctx.addLine(to: CGPoint(x: w, y: gy)) }
  ctx.strokePath()
}
save(canvas(160, 160) { ctx in tiles(ctx, 160, 160) }, "textures/gate-tile.jpg", jpeg: true)

// 南側高門柱正面（1.6 m × 5.6 m）：直寫「新竹縣／關西鎮」兩行小字＋「太平國民小學」
let ppm: CGFloat = 160
save(canvas(256, 896) { ctx in
  tiles(ctx, 256, 896)
  let letter = NSColor(calibratedRed: 0.30, green: 0.27, blue: 0.24, alpha: 1)
  let small = kai(60)
  for (i, ch) in "新竹縣".enumerated() { text(String(ch), small, letter, at: CGPoint(x: 168, y: 40 + CGFloat(i) * 70)) }
  for (i, ch) in "關西鎮".enumerated() { text(String(ch), small, letter, at: CGPoint(x: 88, y: 40 + CGFloat(i) * 70)) }
  let big = kai(84)
  for (i, ch) in "太平國民小學".enumerated() { text(String(ch), big, letter, at: CGPoint(x: 128, y: 260 + CGFloat(i) * 96)) }
}, "textures/gate-pillar.jpg", jpeg: true)

// 北側拱門正面（3.0 m × 4.0 m）：英文校名、拱形門洞、咖啡色格柵鐵門
func archFace(english: Bool) -> CGImage {
  canvas(480, 640) { ctx in
    tiles(ctx, 480, 640)
    let ox: CGFloat = 0.45 * ppm, ow: CGFloat = 1.75 * ppm, top: CGFloat = 1.0 * ppm, bottom: CGFloat = 640
    let r = ow / 2
    let arch = CGMutablePath()
    arch.move(to: CGPoint(x: ox, y: bottom))
    arch.addLine(to: CGPoint(x: ox, y: top + r))
    arch.addArc(center: CGPoint(x: ox + r, y: top + r), radius: r, startAngle: .pi, endAngle: 0, clockwise: false)
    arch.addLine(to: CGPoint(x: ox + ow, y: bottom))
    arch.closeSubpath()
    // 門洞邊的磚框
    ctx.addPath(arch.copy(strokingWithWidth: 22, lineCap: .butt, lineJoin: .miter, miterLimit: 4))
    NSColor(calibratedRed: 0.72, green: 0.44, blue: 0.36, alpha: 1).setFill(); ctx.fillPath()
    ctx.addPath(arch); NSColor(calibratedWhite: 0.93, alpha: 1).setFill(); ctx.fillPath()
    // 格柵鐵門（下方約 2.1 m）
    let gx = ox + 14, gw = ow - 28, gy = bottom - 2.15 * ppm
    let bronze = NSColor(calibratedRed: 0.45, green: 0.38, blue: 0.30, alpha: 1)
    bronze.setStroke(); ctx.setLineWidth(9)
    ctx.stroke(CGRect(x: gx, y: gy, width: gw, height: bottom - gy - 6))
    ctx.setLineWidth(6)
    let cols = 4, rows = 6
    for i in 1..<cols { let x = gx + gw * CGFloat(i) / CGFloat(cols); ctx.move(to: CGPoint(x: x, y: gy)); ctx.addLine(to: CGPoint(x: x, y: bottom)) }
    for j in 1..<rows {
      let y = gy + (bottom - gy) * CGFloat(j) / CGFloat(rows)
      let shift = (j % 2 == 0) ? gw / 8 : -gw / 8
      ctx.move(to: CGPoint(x: gx, y: y)); ctx.addLine(to: CGPoint(x: gx + gw / 2 + shift, y: y))
      ctx.move(to: CGPoint(x: gx + gw / 2 - shift, y: y + 18)); ctx.addLine(to: CGPoint(x: gx + gw, y: y + 18))
    }
    ctx.strokePath()
    if english {
      let ink = NSColor(calibratedRed: 0.97, green: 0.94, blue: 0.86, alpha: 1)
      text("Taiping Elementary School", serif(30), ink, at: CGPoint(x: 240, y: 28))
      text("Guansi Township Hsinchu County", serif(25), ink, at: CGPoint(x: 240, y: 72))
    }
  }
}
save(archFace(english: true), "textures/gate-arch.jpg", jpeg: true)
save(archFace(english: false), "textures/gate-arch-back.jpg", jpeg: true)

// ---------- 4. 東平里衛生室：正面上方的磁磚橫帶與字 ----------
save(canvas(768, 128) { ctx in
  NSColor(calibratedRed: 0.86, green: 0.85, blue: 0.80, alpha: 1).setFill()
  ctx.fill(CGRect(x: 0, y: 0, width: 768, height: 128))
  // 小方塊磁磚紋
  NSColor(calibratedWhite: 0.72, alpha: 1).setStroke(); ctx.setLineWidth(1.5)
  for x in stride(from: CGFloat(0), through: 768, by: 16) { ctx.move(to: CGPoint(x: x, y: 0)); ctx.addLine(to: CGPoint(x: x, y: 128)) }
  for y in stride(from: CGFloat(0), through: 128, by: 16) { ctx.move(to: CGPoint(x: 0, y: y)); ctx.addLine(to: CGPoint(x: 768, y: y)) }
  ctx.strokePath()
  // 六個字各在一塊深色方框裡（照片上由右往左讀，這裡照一般閱讀順序排）
  let gold = NSColor(calibratedRed: 0.86, green: 0.72, blue: 0.36, alpha: 1)
  for (i, ch) in "東平里衛生室".enumerated() {
    let cx = 64 + CGFloat(i) * 128
    NSColor(calibratedRed: 0.33, green: 0.36, blue: 0.34, alpha: 1).setFill()
    ctx.fill(CGRect(x: cx - 44, y: 20, width: 88, height: 88))
    text(String(ch), kai(68), gold, at: CGPoint(x: cx, y: 24))
  }
}, "textures/clinic-sign.jpg", jpeg: true)
