"use client";

import Canvas from "./Canvas";

export interface BoardShellProps {
  roomId: string;
  name: string;
  color: string;
}

// Canvas now owns the topbar too (brand + live presence + real remote
// avatars), since presence data comes from the same realtime connection
// it manages. This wrapper exists to keep board/[roomId]/page.tsx's props
// stable if a non-canvas chrome layer (e.g. a header) gets added later.
export default function BoardShell({ roomId, name, color }: BoardShellProps) {
  return <Canvas roomId={roomId} name={name} color={color} />;
}
