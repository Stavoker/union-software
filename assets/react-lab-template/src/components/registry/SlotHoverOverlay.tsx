type Props = {
  label?: string;
};

export function SlotHoverOverlay({ label = "Играть" }: Props) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
      <span className="btn-brand px-5 py-2 text-sm font-semibold shadow-lg">{label}</span>
    </span>
  );
}
