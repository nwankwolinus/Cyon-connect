import React from "react";
import Image from "next/image";

type ParishCyonBrandProps = {
  readonly className?: string;
  readonly centered?: boolean;
  readonly size?: "compact" | "regular";
};

/** Parish identity followed by the CYON Nigeria emblem, using supplied image assets. */
export function ParishCyonBrand({
  className = "",
  centered = false,
  size = "compact",
}: ParishCyonBrandProps) {
  const large = size === "regular";
  return (
    <div className={`flex items-center gap-3 ${centered ? "justify-center" : ""} ${className}`}>
      <Image
        src="/ss-joachim-and-anne-parish.jpg"
        alt="SS Joachim and Anne Parish emblem"
        width={large ? 64 : 44}
        height={large ? 64 : 44}
        className={`${large ? "size-16" : "size-11"} shrink-0 rounded-xl object-cover ring-1 ring-black/10`}
        priority
      />
      <Image
        src="/cyon-nigeria-logo.png"
        alt="Catholic Youth Organization of Nigeria logo"
        width={large ? 64 : 44}
        height={large ? 64 : 44}
        className={`${large ? "size-16" : "size-11"} shrink-0 object-contain`}
        priority
      />
      <span className="min-w-0">
        <span className="block text-sm font-extrabold tracking-[0.12em] text-emerald-950">
          CYON CONNECT
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-600">
          SS Joachim and Anne Parish, Ijegun
        </span>
      </span>
    </div>
  );
}
