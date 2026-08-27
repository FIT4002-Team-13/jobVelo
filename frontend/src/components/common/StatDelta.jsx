export default function StatDelta({ value = "", label = "" }) {
  const isNegative = typeof value === "string" && value.startsWith("-");

  return (
    <span
      className={`
        inline-flex
        w-fit
        shrink-0
        items-center
        gap-1
        px-3 py-1
        rounded-pill
        text-xs font-medium
        whitespace-nowrap
        ${isNegative ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}
      `}
    >
      <span>{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}