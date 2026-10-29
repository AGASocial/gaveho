export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="16"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      <text
        x="50"
        y="50"
        fontFamily="monospace"
        fontSize="32"
        fontWeight="700"
        fill="currentColor"
        textAnchor="middle"
        dominantBaseline="central"
      >
        GV
      </text>
    </svg>
  )
}
