// DeckShep original artwork. Copyright (c) 2026 Everett Kotler.
// Rasterizes the same geometry as assets/plugin-icon-source.svg.
import AppKit
import ImageIO
import UniformTypeIdentifiers

let destination = URL(fileURLWithPath: CommandLine.arguments[1])
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> CGColor {
    CGColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1)
}
for (size, name) in [(144, "icon.png"), (288, "icon@2x.png")] {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
        bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.translateBy(x: 0, y: CGFloat(size))
    context.scaleBy(x: CGFloat(size) / 144, y: -CGFloat(size) / 144)
    context.setFillColor(color(16, 42, 46))
    context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 144, height: 144),
        cornerWidth: 28, cornerHeight: 28, transform: nil))
    context.fillPath()
    for (x, y, amber) in [(30, 68, false), (60, 68, false), (30, 98, false), (60, 98, true)] {
        context.setFillColor(amber ? color(255, 182, 108) : color(134, 225, 182))
        context.addPath(CGPath(roundedRect: CGRect(x: x, y: y, width: 22, height: 22),
            cornerWidth: 6, cornerHeight: 6, transform: nil))
        context.fillPath()
    }
    context.setStrokeColor(color(243, 240, 231))
    context.setLineWidth(10); context.setLineCap(.round); context.setLineJoin(.round)
    context.move(to: CGPoint(x: 100, y: 110)); context.addLine(to: CGPoint(x: 100, y: 43))
    context.addCurve(to: CGPoint(x: 70, y: 43), control1: CGPoint(x: 100, y: 23), control2: CGPoint(x: 70, y: 23))
    context.addCurve(to: CGPoint(x: 88, y: 53), control1: CGPoint(x: 70, y: 55), control2: CGPoint(x: 80, y: 60))
    context.strokePath()
    let output = CGImageDestinationCreateWithURL(destination.appendingPathComponent(name) as CFURL,
        UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(output, context.makeImage()!, nil)
    guard CGImageDestinationFinalize(output) else { fatalError("Cannot write brand icon") }
}
