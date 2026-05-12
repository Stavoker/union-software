import Image from "next/image";
import logoPng from "@/logo/logo.png";

type Props = {
  className?: string;
  /** Перший екран логіну — швидше показати лого */
  priority?: boolean;
};

export function UnionLogo({
  className = "",
  priority = false,
}: Props) {
  return (
    <Image
      src={logoPng}
      alt="Union"
      width={36}
      height={36}
      sizes="36px"
      priority={priority}
      className={`h-9 w-9 overflow-hidden object-contain ${className}`}
    />
  );
}
