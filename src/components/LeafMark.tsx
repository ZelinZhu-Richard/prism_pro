import { Leaf } from "lucide-react";
export function LeafMark({ size = 27 }: { size?: number }) {
  return <Leaf size={size} strokeWidth={1.6} aria-hidden="true" />;
}
