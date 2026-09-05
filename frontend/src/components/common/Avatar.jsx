import { initials, avatarColor } from "../../utils/avatar.js";

export default function Avatar({ name, size = "md", className = "" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-xs";
  return (
    <div
      title={name}
      className={`${sz} rounded-pill flex items-center justify-center text-white font-bold shrink-0 ${avatarColor(name)} ${className}`}
    >
      {initials(name)}
    </div>
  );
}
