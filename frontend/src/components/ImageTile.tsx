import { useState } from "react";

export function ImageTile({
  src,
  name,
  category,
  eager = false,
  onFail,
}: {
  src: string;
  name: string;
  category: string;
  eager?: boolean;
  onFail?: () => void;
}) {
  const [failed, setFailed] = useState(!src);
  if (failed) {
    const initials = name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    return (
      <div className="ph" data-cat={category}>
        <span>{initials}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
        onFail?.();
      }}
    />
  );
}
