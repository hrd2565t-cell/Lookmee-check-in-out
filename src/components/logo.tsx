import Image from "next/image";

/**
 * ครอปเฉพาะรูปหมี+หมุดจาก LOGO.jpg (2816x1536)
 * กล่องที่ครอป: x 33.7%–66.4%, y 7%–~67% ของรูป
 */
const CROP = { x0: 0.337, w: 0.327, y0: 0.07 };
const RATIO = 1536 / 2816;

export function BrandMark({ size = 40 }: { size?: number }) {
  const imgW = size / CROP.w;
  const imgH = imgW * RATIO;
  return (
    <span
      aria-hidden="true"
      className="relative inline-block shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-[#e4eaf3]"
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.jpg"
        alt=""
        width={imgW}
        height={imgH}
        sizes={`${size}px`}
        style={{
          maxWidth: "none",
          marginLeft: -CROP.x0 * imgW,
          marginTop: -CROP.y0 * imgH,
        }}
      />
    </span>
  );
}

export function FullLogo() {
  return (
    <Image
      src="/logo.jpg"
      alt="LOOKMEE CHECK IN-OUT"
      width={400}
      height={218}
      priority
      className="h-auto w-full"
    />
  );
}
