/** Fraunces with the wonk axis let loose, and the domain in copper. */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">
        NonStick
      </span>
      <span className="font-display text-[17px] text-copper">.ai</span>
    </span>
  );
}
