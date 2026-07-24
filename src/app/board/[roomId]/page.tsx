"use client";

import { use, useState } from "react";
import JoinCard from "@/components/JoinCard";
import BoardShell from "@/components/BoardShell";

export default function BoardPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const [me, setMe] = useState<{ name: string; color: string } | null>(null);

  if (!me) {
    return <JoinCard roomId={roomId} onJoin={(name, color) => setMe({ name, color })} />;
  }

  return <BoardShell roomId={roomId} name={me.name} color={me.color} />;
}
